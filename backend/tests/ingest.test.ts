import { describe, expect, it } from 'vitest'
import { fetchRawStations } from '../src/ingest/fetchStations'
import { parseStationRecord, parseStationRecords } from '../src/ingest/parseRecord'

const FEED = 'https://data.economie.gouv.fr/api/explore/v2.1/catalog/datasets/x/exports/json'
const validRecord = (overrides: Record<string, unknown> = {}) => ({
  id: 1,
  geom: { lat: 48.85, lon: 2.35 },
  gazole_prix: 1.9,
  gazole_maj: '2026-10-17T08:00:00+00:00',
  ...overrides,
})

const jsonResponse = (body: unknown, init: ResponseInit = {}) =>
  new Response(JSON.stringify(body), {
    headers: { 'content-type': 'application/json' },
    ...init,
  })

describe('parser hardening', () => {
  it('drops a price whose date is unreadable instead of showing it as fresh', () => {
    const result = parseStationRecord(validRecord({ gazole_maj: 'not-a-date' }))
    expect(result.ok && result.value.prices).toEqual([])
  })

  it.each([
    ['out of range latitude', { geom: { lat: 123, lon: 2 } }],
    ['out of range longitude', { geom: { lat: 48, lon: 400 } }],
    ['zero id', { id: 0 }],
    ['float id', { id: 1.5 }],
    ['oversized text', { adresse: 'x'.repeat(5_000) }],
  ])('rejects %s', (_label, overrides) => {
    expect(parseStationRecord(validRecord(overrides)).ok).toBe(false)
  })

  it('ignores absurd prices', () => {
    const result = parseStationRecord(validRecord({ gazole_prix: 9_999 }))
    expect(result.ok && result.value.prices).toEqual([])
  })

  it('ignores unknown shortage types and matches known ones case-insensitively', () => {
    const result = parseStationRecord(
      validRecord({
        gazole_rupture_type: 'inconnu',
        gazole_rupture_debut: '2026-10-10T00:00:00Z',
        e10_rupture_type: 'TEMPORAIRE',
        e10_rupture_debut: '2026-10-10T00:00:00Z',
      }),
    )
    expect(result.ok && result.value.shortages.map((s) => [s.fuel, s.type])).toEqual([
      ['e10', 'temporaire'],
    ])
  })

  it('keeps the last record for a duplicated id and reports it', () => {
    const batch = parseStationRecords([
      validRecord({ id: 7, adresse: 'old' }),
      validRecord({ id: 7, adresse: 'new' }),
    ])
    expect(batch.stations).toHaveLength(1)
    expect(batch.stations[0]?.address).toBe('new')
    expect(batch.skipped).toEqual({ duplicate: 1 })
  })
})

describe('fetchRawStations', () => {
  it('returns the parsed array on success', async () => {
    const records = await fetchRawStations(async () => jsonResponse([{ id: 1 }]), FEED)
    expect(records).toEqual([{ id: 1 }])
  })

  it('rejects a host outside the allow-list before any request', async () => {
    let called = false
    const spy = async () => {
      called = true
      return jsonResponse([])
    }
    await expect(fetchRawStations(spy, 'https://evil.example/feed.json')).rejects.toThrow(
      /untrusted/,
    )
    await expect(fetchRawStations(spy, 'http://data.economie.gouv.fr/x')).rejects.toThrow(
      /untrusted/,
    )
    expect(called).toBe(false)
  })

  it('fails on a non-OK status', async () => {
    await expect(
      fetchRawStations(async () => jsonResponse([], { status: 503 }), FEED),
    ).rejects.toThrow(/HTTP 503/)
  })

  it('fails on a non-JSON content type', async () => {
    const html = async () =>
      new Response('<html></html>', { headers: { 'content-type': 'text/html' } })
    await expect(fetchRawStations(html, FEED)).rejects.toThrow(/content type/)
  })

  it('fails when the payload is not an array', async () => {
    await expect(fetchRawStations(async () => jsonResponse({ a: 1 }), FEED)).rejects.toThrow(
      /array/,
    )
  })

  it('fails when the declared size is above the limit', async () => {
    const huge = async () =>
      new Response('[]', {
        headers: {
          'content-type': 'application/json',
          'content-length': String(500 * 1024 * 1024),
        },
      })
    await expect(fetchRawStations(huge, FEED)).rejects.toThrow(/larger than/)
  })
})
