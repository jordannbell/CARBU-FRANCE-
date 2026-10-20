import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { buildApp } from '../src/app'
import { StationRepository } from '../src/db/stationRepository'
import type { Station } from '../src/domain'

const NOW = new Date('2026-10-17T12:00:00Z')

const makeStation = (overrides: Partial<Station> & Pick<Station, 'id'>): Station => ({
  latitude: 48.8566,
  longitude: 2.3522,
  address: '1 rue de Rivoli',
  city: 'Paris',
  postalCode: '75001',
  departmentCode: '75',
  open24h: false,
  services: [],
  hours: [],
  prices: [],
  shortages: [],
  ...overrides,
})

const stations: Station[] = [
  makeStation({
    id: 1,
    prices: [{ fuel: 'gazole', price: 1.9, updatedAt: '2026-10-17T08:00:00Z' }],
  }),
  makeStation({
    id: 2,
    latitude: 48.87,
    prices: [{ fuel: 'gazole', price: 1.7, updatedAt: '2026-10-10T08:00:00Z' }],
    shortages: [{ fuel: 'gazole', type: 'temporaire', since: '2026-10-15T00:00:00Z' }],
  }),
  makeStation({
    id: 3,
    latitude: 45.764,
    longitude: 4.8357,
    city: 'Lyon',
    prices: [{ fuel: 'gazole', price: 1.5, updatedAt: '2026-10-17T08:00:00Z' }],
  }),
  makeStation({
    id: 4,
    prices: [{ fuel: 'sp98', price: 2.0, updatedAt: '2026-10-17T08:00:00Z' }],
  }),
]

let repository: StationRepository

beforeEach(() => {
  repository = new StationRepository(':memory:')
  repository.replaceAll(stations, NOW.toISOString())
})

afterEach(() => repository.close())

const app = () => buildApp({ repository, now: () => NOW })

describe('GET /stations', () => {
  it('returns nearby stations sorted by price and excludes far or other-fuel ones', async () => {
    const res = await (
      await app()
    ).inject('/stations?lat=48.8566&lon=2.3522&fuel=gazole&radiusKm=10')
    const body = res.json()

    expect(res.statusCode).toBe(200)
    expect(body.success).toBe(true)
    expect(body.data.map((s: { id: number }) => s.id)).toEqual([2, 1])
    expect(body.meta.count).toBe(2)
  })

  it('flags stale prices and temporary shortages', async () => {
    const res = await (await app()).inject('/stations?lat=48.8566&lon=2.3522&fuel=gazole')
    const [cheapest] = res.json().data

    expect(cheapest.id).toBe(2)
    expect(cheapest.stale).toBe(true)
    expect(cheapest.shortage).toMatchObject({ type: 'temporaire' })
  })

  it('sorts by distance when asked', async () => {
    const res = await (
      await app()
    ).inject('/stations?lat=48.8566&lon=2.3522&fuel=gazole&sort=distance')
    expect(res.json().data.map((s: { id: number }) => s.id)).toEqual([1, 2])
  })

  it('respects the limit', async () => {
    const res = await (await app()).inject('/stations?lat=48.8566&lon=2.3522&fuel=gazole&limit=1')
    expect(res.json().data).toHaveLength(1)
  })

  it.each([
    ['missing coordinates', '/stations?fuel=gazole'],
    ['unknown fuel', '/stations?lat=48&lon=2&fuel=kerosene'],
    ['radius too large', '/stations?lat=48&lon=2&fuel=gazole&radiusKm=500'],
    ['latitude out of range', '/stations?lat=120&lon=2&fuel=gazole'],
  ])('rejects %s with a 400', async (_label, url) => {
    const res = await (await app()).inject(url)
    expect(res.statusCode).toBe(400)
    expect(res.json()).toMatchObject({ success: false, error: { code: 'INVALID_QUERY' } })
  })
})

describe('GET /stations/:id', () => {
  it('returns the full station with all prices', async () => {
    const res = await (await app()).inject('/stations/2')
    expect(res.statusCode).toBe(200)
    expect(res.json().data.prices[0]).toMatchObject({ fuel: 'gazole', stale: true })
  })

  it('returns 404 for an unknown station', async () => {
    const res = await (await app()).inject('/stations/999')
    expect(res.statusCode).toBe(404)
  })

  it('returns 400 for an invalid id', async () => {
    const res = await (await app()).inject('/stations/abc')
    expect(res.statusCode).toBe(400)
  })
})

describe('GET /health', () => {
  it('reports station count and last ingestion time', async () => {
    const res = await (await app()).inject('/health')
    expect(res.json()).toMatchObject({
      data: { stations: 4 },
      meta: { lastIngestedAt: NOW.toISOString() },
    })
  })
})
