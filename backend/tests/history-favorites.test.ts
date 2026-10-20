import { mkdtempSync, rmSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { buildApp } from '../src/app'
import { StationRepository } from '../src/db/stationRepository'
import type { Station } from '../src/domain'

const NOW = new Date('2026-10-17T12:00:00Z')

const station = (id: number, overrides: Partial<Station> = {}): Station => ({
  id,
  latitude: 48.8566,
  longitude: 2.3522,
  address: `${id} rue X`,
  city: 'Paris',
  postalCode: '75001',
  departmentCode: '75',
  open24h: false,
  services: ['Station de gonflage'],
  hours: [{ day: 1, closed: false, ranges: [{ open: '07:00', close: '21:00' }] }],
  prices: [{ fuel: 'gazole', price: 1.9, updatedAt: '2026-10-17T08:00:00Z' }],
  shortages: [],
  ...overrides,
})

let repository: StationRepository
beforeEach(() => {
  repository = new StationRepository(':memory:')
})
afterEach(() => repository.close())

const app = () => buildApp({ repository, now: () => NOW })

describe('price history', () => {
  it('records a point only when the price changes', () => {
    const at = (day: number, price: number) =>
      station(1, { prices: [{ fuel: 'gazole', price, updatedAt: `2026-10-${day}T08:00:00Z` }] })

    repository.replaceAll([at(10, 1.9)], '2026-10-10T09:00:00Z')
    repository.replaceAll([at(11, 1.9)], '2026-10-11T09:00:00Z') // same price, newer date
    repository.replaceAll([at(12, 1.95)], '2026-10-12T09:00:00Z')

    const history = repository.priceHistory(1, 'gazole', '2026-01-01T00:00:00Z')
    expect(history.points.map((p) => p.price)).toEqual([1.9, 1.95])
    expect(history.since).toBe('2026-10-10T08:00:00.000Z')
  })

  it('keeps history across ingestions even when a station disappears', () => {
    repository.replaceAll([station(1)], '2026-10-10T09:00:00Z')
    repository.replaceAll([station(2)], '2026-10-11T09:00:00Z')
    expect(repository.priceHistory(1, 'gazole', '2026-01-01T00:00:00Z').points).toHaveLength(1)
  })

  it('includes the price in force at the start of the window', () => {
    const at = (day: number, price: number) =>
      station(1, { prices: [{ fuel: 'gazole', price, updatedAt: `2026-09-${day}T08:00:00Z` }] })
    repository.replaceAll([at(10, 1.8)], '2026-09-10T09:00:00Z')
    repository.replaceAll([at(25, 2.0)], '2026-09-25T09:00:00Z')

    const history = repository.priceHistory(1, 'gazole', '2026-09-20T00:00:00Z')
    expect(history.points.map((p) => p.price)).toEqual([1.8, 2.0])
  })

  it('prunes points older than the retention period', () => {
    repository.replaceAll(
      [station(1, { prices: [{ fuel: 'gazole', price: 1.5, updatedAt: '2024-01-01T00:00:00Z' }] })],
      '2024-01-01T01:00:00Z',
    )
    repository.replaceAll([station(1)], '2026-10-17T09:00:00Z')
    const history = repository.priceHistory(1, 'gazole', '2020-01-01T00:00:00Z')
    expect(history.points.map((p) => p.price)).toEqual([1.9])
  })
})

describe('GET /stations/:id/history', () => {
  it('returns the points, the window and the first observation date', async () => {
    repository.replaceAll([station(1)], NOW.toISOString())
    const res = await (await app()).inject('/stations/1/history?fuel=gazole&days=30')
    expect(res.statusCode).toBe(200)
    expect(res.json().data).toMatchObject({
      fuel: 'gazole',
      days: 30,
      since: '2026-10-17T08:00:00.000Z',
      points: [{ price: 1.9 }],
    })
  })

  it.each([
    ['/stations/1/history', 400],
    ['/stations/1/history?fuel=gazole&days=0', 400],
    ['/stations/1/history?fuel=gazole&days=9999', 400],
    ['/stations/999/history?fuel=gazole', 404],
  ])('answers %s with %i', async (url, status) => {
    repository.replaceAll([station(1)], NOW.toISOString())
    expect((await (await app()).inject(url)).statusCode).toBe(status)
  })
})

describe('GET /stations/by-ids (favourites)', () => {
  beforeEach(() => {
    repository.replaceAll(
      [
        station(1),
        station(2, {
          latitude: 45.764,
          longitude: 4.8357,
          prices: [{ fuel: 'gazole', price: 1.7, updatedAt: '2026-10-17T08:00:00Z' }],
        }),
        station(3, { prices: [{ fuel: 'sp98', price: 2.1, updatedAt: '2026-10-17T08:00:00Z' }] }),
      ],
      NOW.toISOString(),
    )
  })

  const URL = (ids: string) => `/stations/by-ids?ids=${ids}&fuel=gazole&lat=48.8566&lon=2.3522`

  it('returns stations wherever they are, with their distance from the user', async () => {
    const res = await (await app()).inject(URL('1,2'))
    const data = res.json().data as { id: number; distanceKm: number }[]
    expect(data.map((s) => s.id)).toEqual([2, 1])
    expect(data.find((s) => s.id === 2)?.distanceKm).toBeGreaterThan(300)
  })

  it('skips stations without a price for the fuel and reports how many were asked', async () => {
    const res = await (await app()).inject(URL('1,3,404'))
    expect(res.json().data.map((s: { id: number }) => s.id)).toEqual([1])
    expect(res.json().meta).toMatchObject({ count: 1, requested: 3 })
  })

  it('is not cached publicly because it lists a user-specific selection', async () => {
    const res = await (await app()).inject(URL('1'))
    expect(res.headers['cache-control']).toBe('private, no-store')
  })

  it.each([
    ['empty list', URL('')],
    ['non numeric id', URL('1,abc')],
    ['too many ids', URL(Array.from({ length: 51 }, (_, i) => i + 1).join(','))],
    ['sql injection', URL('1;DROP TABLE stations')],
  ])('rejects %s', async (_label, url) => {
    expect((await (await app()).inject(url)).statusCode).toBe(400)
  })

  it('is not shadowed by the /stations/:id route', async () => {
    const res = await (await app()).inject(URL('1'))
    expect(res.statusCode).toBe(200)
    expect(Array.isArray(res.json().data)).toBe(true)
  })
})

describe('GET /stations/:id (detail)', () => {
  it('returns opening hours, services and every price', async () => {
    repository.replaceAll(
      [
        station(1, {
          prices: [
            { fuel: 'gazole', price: 1.9, updatedAt: '2026-10-17T08:00:00Z' },
            { fuel: 'sp98', price: 2.1, updatedAt: '2026-09-01T08:00:00Z' },
          ],
        }),
      ],
      NOW.toISOString(),
    )
    const res = await (await app()).inject('/stations/1')
    const data = res.json().data
    expect(data.hours[0]).toMatchObject({ day: 1, closed: false })
    expect(data.services).toContain('Station de gonflage')
    expect(data.prices.map((p: { fuel: string; stale: boolean }) => [p.fuel, p.stale])).toEqual([
      ['gazole', false],
      ['sp98', true],
    ])
  })
})

describe('schema migration', () => {
  it('upgrades a database created before versioning without losing data', () => {
    const dir = mkdtempSync(join(tmpdir(), 'carbu-migration-'))
    const path = join(dir, 'old.db')
    try {
      const old = new DatabaseSync(path)
      old.exec(`
        CREATE TABLE stations (id INTEGER PRIMARY KEY, latitude REAL NOT NULL, longitude REAL NOT NULL,
          address TEXT NOT NULL, city TEXT NOT NULL, postal_code TEXT NOT NULL,
          department_code TEXT NOT NULL, open_24h INTEGER NOT NULL, services TEXT NOT NULL);
        CREATE TABLE prices (station_id INTEGER NOT NULL, fuel TEXT NOT NULL, price REAL NOT NULL,
          updated_at TEXT NOT NULL, PRIMARY KEY (station_id, fuel));
        CREATE TABLE shortages (station_id INTEGER NOT NULL, fuel TEXT NOT NULL, type TEXT NOT NULL,
          since TEXT NOT NULL, PRIMARY KEY (station_id, fuel));
        CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
        INSERT INTO stations VALUES (5, 48.8, 2.3, 'old', 'Paris', '75001', '75', 0, '[]');
        INSERT INTO prices VALUES (5, 'gazole', 1.8, '2026-10-01T00:00:00Z');
      `)
      old.close()

      const upgraded = new StationRepository(path)
      const found = upgraded.findById(5)
      expect(found).toMatchObject({ id: 5, address: 'old', hours: [] })
      expect(found?.prices).toHaveLength(1)
      expect(upgraded.priceHistory(5, 'gazole', '2020-01-01T00:00:00Z').points).toEqual([])
      upgraded.close()

      // Opening it again must be a no-op.
      new StationRepository(path).close()
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
