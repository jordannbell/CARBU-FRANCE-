import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { buildApp } from '../src/app'
import { StationRepository } from '../src/db/stationRepository'
import type { Station, StationReader } from '../src/domain'

const NOW = new Date('2026-10-17T12:00:00Z')

const station = (overrides: Partial<Station> & Pick<Station, 'id'>): Station => ({
  latitude: 48.8566,
  longitude: 2.3522,
  address: 'a',
  city: 'Paris',
  postalCode: '75001',
  departmentCode: '75',
  open24h: false,
  services: [],
  hours: [],
  prices: [{ fuel: 'gazole', price: 1.9, updatedAt: '2026-10-17T08:00:00Z' }],
  shortages: [],
  ...overrides,
})

let repository: StationRepository

beforeEach(() => {
  repository = new StationRepository(':memory:')
  repository.replaceAll(
    [
      station({ id: 1 }),
      station({
        id: 2,
        prices: [{ fuel: 'gazole', price: 1.1, updatedAt: '2026-10-17T08:00:00Z' }],
        shortages: [{ fuel: 'gazole', type: 'definitive', since: '2020-01-01T00:00:00Z' }],
      }),
    ],
    NOW.toISOString(),
  )
})

afterEach(() => repository.close())

const makeApp = (extra: Parameters<typeof buildApp>[0] extends infer O ? Partial<O> : never = {}) =>
  buildApp({ repository, now: () => NOW, ...extra })

describe('HTTP hardening', () => {
  it('sends security headers', async () => {
    const res = await (await makeApp()).inject('/health')
    expect(res.headers['x-content-type-options']).toBe('nosniff')
    expect(res.headers['content-security-policy']).toContain("default-src 'none'")
    expect(res.headers['x-powered-by']).toBeUndefined()
  })

  it('does not allow cross-origin browsers by default', async () => {
    const res = await (
      await makeApp()
    ).inject({
      url: '/health',
      headers: { origin: 'https://evil.example' },
    })
    expect(res.headers['access-control-allow-origin']).toBeUndefined()
  })

  it('allows only configured origins', async () => {
    const app = await makeApp({ corsOrigins: ['https://app.example'] })
    const allowed = await app.inject({ url: '/health', headers: { origin: 'https://app.example' } })
    const denied = await app.inject({ url: '/health', headers: { origin: 'https://evil.example' } })
    expect(allowed.headers['access-control-allow-origin']).toBe('https://app.example')
    expect(denied.headers['access-control-allow-origin']).toBeUndefined()
  })

  it('rate limits excessive requests with an envelope', async () => {
    const app = await makeApp({ rateLimitPerMinute: 3 })
    const statuses: number[] = []
    for (let i = 0; i < 5; i += 1) statuses.push((await app.inject('/health')).statusCode)
    expect(statuses.slice(0, 3)).toEqual([200, 200, 200])
    expect(statuses.slice(3)).toEqual([429, 429])
    const blocked = await app.inject('/health')
    expect(blocked.json()).toMatchObject({ success: false, error: { code: 'RATE_LIMITED' } })
  })

  it('answers unknown routes with a 404 envelope', async () => {
    const res = await (await makeApp()).inject('/nope')
    expect(res.statusCode).toBe(404)
    expect(res.json()).toMatchObject({ success: false, error: { code: 'NOT_FOUND' } })
  })

  it('hides internal error details behind a generic 500 envelope', async () => {
    const broken: StationReader = {
      count: () => {
        throw new Error('database password leaked here')
      },
      lastIngestedAt: () => null,
      findNearby: () => [],
      findByIds: () => [],
      findById: () => null,
      findInArea: () => ({ stations: [], total: 0 }),
      brandsNear: () => [],
      priceHistory: () => ({ points: [], since: null }),
    }
    const res = await (await buildApp({ repository: broken })).inject('/health')
    expect(res.statusCode).toBe(500)
    expect(res.body).not.toContain('database password')
    expect(res.json()).toMatchObject({ success: false, error: { code: 'INTERNAL' } })
  })

  it('rejects an oversized request body', async () => {
    const res = await (
      await makeApp()
    ).inject({
      method: 'POST',
      url: '/stations',
      payload: 'x'.repeat(5_000),
      headers: { 'content-type': 'text/plain' },
    })
    expect([404, 413, 415]).toContain(res.statusCode)
    expect(res.json()).toMatchObject({ success: false })
  })
})

describe('input validation', () => {
  it.each([
    ['empty latitude', '/stations?lat=&lon=2&fuel=gazole'],
    ['empty longitude', '/stations?lat=48&lon=&fuel=gazole'],
    ['non numeric', '/stations?lat=abc&lon=2&fuel=gazole'],
    ['infinite', '/stations?lat=Infinity&lon=2&fuel=gazole'],
    ['negative radius', '/stations?lat=48&lon=2&fuel=gazole&radiusKm=-1'],
    ['zero limit', '/stations?lat=48&lon=2&fuel=gazole&limit=0'],
    ['sql injection attempt', "/stations?lat=48&lon=2&fuel=gazole'%3B DROP TABLE stations--"],
  ])('rejects %s', async (_label, url) => {
    const res = await (await makeApp()).inject(url)
    expect(res.statusCode).toBe(400)
    expect(res.json().error.code).toBe('INVALID_QUERY')
  })

  it('does not echo user input in validation errors', async () => {
    const res = await (await makeApp()).inject('/stations?lat=<script>&lon=2&fuel=gazole')
    expect(res.body).not.toContain('<script>')
  })
})

describe('privacy and data rules', () => {
  it('never returns stations with a definitive shortage for the fuel', async () => {
    const res = await (await makeApp()).inject('/stations?lat=48.8566&lon=2.3522&fuel=gazole')
    expect(res.json().data.map((s: { id: number }) => s.id)).toEqual([1])
  })

  it('sets a public cache header for repeated searches', async () => {
    const res = await (await makeApp()).inject('/stations?lat=48.8566&lon=2.3522&fuel=gazole')
    expect(res.headers['cache-control']).toBe('public, max-age=60')
  })

  it('treats nearby coordinates as the same cached search (rounded to ~110 m)', async () => {
    const app = await makeApp()
    const first = await app.inject('/stations?lat=48.85661&lon=2.35221&fuel=gazole')
    const second = await app.inject('/stations?lat=48.85664&lon=2.35224&fuel=gazole')
    expect(second.json()).toEqual(first.json())
  })
})
