import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { buildApp } from '../src/app'
import { StationRepository } from '../src/db/stationRepository'
import { GeocodeError, createIgnGeocoder, type GeocoderPort } from '../src/geocoding/ign'
import { ingestOnce } from '../src/ingest/ingest'
import { startIngestScheduler } from '../src/ingest/scheduler'
import fixture from './fixtures/records-paris.json'

const ignBody = {
  type: 'FeatureCollection',
  features: [
    {
      geometry: { coordinates: [2.333673, 48.859824] },
      properties: { label: 'Port du Louvre 75001 Paris', city: 'Paris', postcode: '75001' },
    },
  ],
}
const json =
  (body: unknown, status = 200) =>
  async () =>
    new Response(JSON.stringify(body), { status })

describe('createIgnGeocoder', () => {
  it('maps features to places with [lat, lon] and rounded coordinates', async () => {
    const places = await createIgnGeocoder(json(ignBody)).search('louvre')
    expect(places).toEqual([
      {
        label: 'Port du Louvre 75001 Paris',
        city: 'Paris',
        postcode: '75001',
        latitude: 48.8598,
        longitude: 2.3337,
      },
    ])
  })

  it('sends only the query text, with autocomplete and a small limit', async () => {
    let requested = ''
    const spy: typeof fetch = async (input) => {
      requested = input instanceof URL ? input.href : typeof input === 'string' ? input : input.url
      return new Response(JSON.stringify(ignBody))
    }
    await createIgnGeocoder(spy).search('8 bd du port')
    const url = new URL(requested)
    expect(url.hostname).toBe('data.geopf.fr')
    expect(url.searchParams.get('q')).toBe('8 bd du port')
    expect(url.searchParams.get('limit')).toBe('5')
    expect(url.searchParams.get('autocomplete')).toBe('1')
  })

  it.each([
    [429, 'busy'],
    [500, 'failed'],
    [404, 'failed'],
  ])('maps provider HTTP %i to %s', async (status, kind) => {
    await expect(createIgnGeocoder(json({}, status)).search('paris')).rejects.toMatchObject({
      kind,
    })
  })

  it('fails on a malformed or out-of-range provider response', async () => {
    const bad = { features: [{ geometry: { coordinates: [500, 99] }, properties: { label: 'x' } }] }
    await expect(createIgnGeocoder(json(bad)).search('paris')).rejects.toMatchObject({
      kind: 'failed',
    })
  })
})

describe('GET /places', () => {
  let repository: StationRepository
  beforeEach(() => {
    repository = new StationRepository(':memory:')
  })
  afterEach(() => repository.close())

  const okGeocoder: GeocoderPort = {
    search: async () => [
      { label: 'Paris', city: 'Paris', postcode: '75000', latitude: 48.85, longitude: 2.35 },
    ],
  }

  it('returns places with the provider attribution', async () => {
    const app = await buildApp({ repository, geocoder: okGeocoder })
    const res = await app.inject('/places?q=paris')
    expect(res.statusCode).toBe(200)
    expect(res.json()).toMatchObject({
      success: true,
      data: [{ label: 'Paris', latitude: 48.85 }],
      meta: { attribution: expect.stringContaining('IGN') },
    })
  })

  it('caches identical queries (case and spacing insensitive)', async () => {
    let calls = 0
    const counting: GeocoderPort = {
      search: async () => {
        calls += 1
        return []
      },
    }
    const app = await buildApp({ repository, geocoder: counting })
    await app.inject('/places?q=Rue%20de%20Rivoli')
    await app.inject('/places?q=rue%20%20de%20rivoli')
    expect(calls).toBe(1)
  })

  it.each([
    ['too short', '/places?q=ab'],
    ['missing', '/places'],
    ['blank', '/places?q=%20%20%20'],
    ['too long', `/places?q=${'a'.repeat(101)}`],
  ])('rejects a %s query', async (_label, url) => {
    const app = await buildApp({ repository, geocoder: okGeocoder })
    expect((await app.inject(url)).statusCode).toBe(400)
  })

  it('answers 503 without a geocoder, and hides provider failures', async () => {
    expect((await (await buildApp({ repository })).inject('/places?q=paris')).statusCode).toBe(503)

    const failing: GeocoderPort = {
      search: async () => {
        throw new GeocodeError('failed', 'secret provider detail')
      },
    }
    const res = await (await buildApp({ repository, geocoder: failing })).inject('/places?q=paris')
    expect(res.statusCode).toBe(502)
    expect(res.body).not.toContain('secret provider detail')
  })

  it('has its own rate limit', async () => {
    const app = await buildApp({ repository, geocoder: okGeocoder, placesRateLimitPerMinute: 2 })
    const statuses: number[] = []
    for (let i = 0; i < 4; i += 1)
      statuses.push((await app.inject(`/places?q=paris${i}`)).statusCode)
    expect(statuses).toEqual([200, 200, 429, 429])
  })
})

describe('ingestOnce', () => {
  const records = fixture.results as unknown[]

  it('stores parsed stations and reports skipped records', async () => {
    const repository = new StationRepository(':memory:')
    const result = await ingestOnce(
      repository,
      {},
      {
        fetchRaw: async () => [...records, { id: 'bad' }],
        now: () => new Date('2026-10-17T10:00:00Z'),
      },
    )
    expect(result.stored).toBe(records.length)
    expect(result.skipped).toEqual({ schema: 1 })
    expect(repository.lastIngestedAt()).toBe('2026-10-17T10:00:00.000Z')
    repository.close()
  })

  it('refuses an empty feed and a truncated feed, but accepts it with force', async () => {
    const repository = new StationRepository(':memory:')
    await ingestOnce(repository, {}, { fetchRaw: async () => records })

    await expect(ingestOnce(repository, {}, { fetchRaw: async () => [] })).rejects.toThrow(
      /No valid/,
    )
    await expect(
      ingestOnce(repository, {}, { fetchRaw: async () => records.slice(0, 2) }),
    ).rejects.toThrow(/truncated/)
    expect(repository.count()).toBe(records.length)

    await ingestOnce(repository, { force: true }, { fetchRaw: async () => records.slice(0, 2) })
    expect(repository.count()).toBe(2)
    repository.close()
  })
})

describe('startIngestScheduler', () => {
  const logger = { info: vi.fn(), error: vi.fn() }
  beforeEach(() => {
    logger.info.mockClear()
    logger.error.mockClear()
  })

  it('keeps the previous data when a run fails, and logs the failure', async () => {
    const repository = new StationRepository(':memory:')
    await ingestOnce(repository, {}, { fetchRaw: async () => fixture.results })
    const before = repository.count()

    const scheduler = startIngestScheduler({
      repository,
      intervalMs: 3_600_000,
      logger,
      deps: {
        fetchRaw: async () => {
          throw new Error('feed down')
        },
      },
    })
    expect(await scheduler.runOnce()).toBeNull()
    expect(repository.count()).toBe(before)
    expect(logger.error).toHaveBeenCalledOnce()
    await scheduler.stop()
    repository.close()
  })

  it('never runs two ingestions at the same time', async () => {
    const repository = new StationRepository(':memory:')
    let calls = 0
    const scheduler = startIngestScheduler({
      repository,
      intervalMs: 3_600_000,
      logger,
      deps: {
        fetchRaw: async () => {
          calls += 1
          await new Promise((resolve) => setTimeout(resolve, 20))
          return fixture.results
        },
      },
    })
    const [first, second] = await Promise.all([scheduler.runOnce(), scheduler.runOnce()])
    expect(calls).toBe(1)
    expect([first, second].filter((r) => r !== null)).toHaveLength(1)
    await scheduler.stop()
    repository.close()
  })
})
