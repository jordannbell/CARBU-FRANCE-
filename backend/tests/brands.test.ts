import { describe, expect, it } from 'vitest'
import { buildApp } from '../src/app'
import { normalizeBrand } from '../src/brands/normalize'
import { fetchOsmBrands, parseOverpass } from '../src/brands/overpass'
import { brandsNeedRefresh, refreshBrands } from '../src/brands/refresh'
import { StationRepository } from '../src/db/stationRepository'
import type { Station } from '../src/domain'

const station = (id: number, latitude: number, price: number): Station => ({
  id,
  latitude,
  longitude: 2.35,
  address: `${id} rue Test`,
  city: 'Paris',
  postalCode: '75001',
  departmentCode: '75',
  open24h: false,
  services: [],
  hours: [],
  prices: [{ fuel: 'e10', price, updatedAt: '2026-10-19T08:00:00.000Z' }],
  shortages: [],
})

const entries = (count: number, name = 'E.Leclerc') =>
  new Map(
    Array.from({ length: count }, (_, i) => [
      i + 1,
      { name, group: 'supermarket' as const, raw: name },
    ]),
  )

describe('normalizeBrand', () => {
  it.each([
    ['E.Leclerc', 'E.Leclerc'],
    ['LECLERC Express', 'E.Leclerc'],
    ['Total Access', 'TotalEnergies'],
    ['TotalEnergies', 'TotalEnergies'],
    ['Intermarché Contact', 'Intermarché'],
    ['Super U', 'Système U'],
    ['U', 'Système U'],
  ])('folds "%s" to "%s"', (raw, name) => {
    expect(normalizeBrand(raw)?.name).toBe(name)
  })

  it.each([undefined, '', '  ', 'independent', 'Station-service'])('returns null for %j', (raw) => {
    expect(normalizeBrand(raw)).toBeNull()
  })

  it('keeps a small regional brand as typed and caps its length', () => {
    expect(normalizeBrand('Station Dupont')).toEqual({ name: 'Station Dupont', group: 'other' })
    expect(normalizeBrand('x'.repeat(100))?.name).toHaveLength(40)
  })
})

describe('parseOverpass', () => {
  it('maps the official station number to a brand and ignores the rest', () => {
    const map = parseOverpass({
      elements: [
        { tags: { 'ref:FR:prix-carburants': '75001001', brand: 'Carrefour Market' } },
        { tags: { 'ref:FR:prix-carburants': '1;2', name: 'Esso Express' } },
        { tags: { 'ref:FR:prix-carburants': '3', brand: 'independent' } },
        { tags: { 'ref:FR:prix-carburants': 'abc', brand: 'Shell' } },
        { tags: { brand: 'Shell' } },
        {},
      ],
    })
    expect(map.get(75001001)?.name).toBe('Carrefour')
    expect(map.get(1)?.name).toBe('Esso')
    expect(map.get(2)?.name).toBe('Esso')
    expect(map.has(3)).toBe(false)
    expect(map.size).toBe(3)
  })

  it('rejects an unexpected shape', () => {
    expect(() => parseOverpass({ nope: true })).toThrow('Unexpected Overpass response')
  })
})

describe('refreshBrands', () => {
  it('stores a full answer', async () => {
    const repo = new StationRepository(':memory:')
    const result = await refreshBrands(repo, new Date(), async () => entries(600))
    expect(result).toEqual({ stored: 600, replaced: true })
    expect(repo.brandCount()).toBe(600)
    repo.close()
  })

  it('keeps the previous brands when the answer is too small or shrinks a lot', async () => {
    const repo = new StationRepository(':memory:')
    await refreshBrands(repo, new Date(), async () => entries(2_000))
    expect((await refreshBrands(repo, new Date(), async () => entries(10))).replaced).toBe(false)
    expect((await refreshBrands(repo, new Date(), async () => entries(900))).replaced).toBe(false)
    expect(repo.brandCount()).toBe(2_000)
    expect((await refreshBrands(repo, new Date(), async () => entries(1_500))).replaced).toBe(true)
    repo.close()
  })

  it('is due when never loaded or older than a week', async () => {
    const repo = new StationRepository(':memory:')
    const now = new Date('2026-10-19T12:00:00Z')
    expect(brandsNeedRefresh(repo, now)).toBe(true)
    await refreshBrands(repo, new Date('2026-10-15T12:00:00Z'), async () => entries(600))
    expect(brandsNeedRefresh(repo, now)).toBe(false)
    expect(brandsNeedRefresh(repo, new Date('2026-10-23T12:00:01Z'))).toBe(true)
    repo.close()
  })
})

describe('brands in the API', () => {
  const setup = async () => {
    const repo = new StationRepository(':memory:')
    repo.replaceAll(
      [station(1, 48.85, 1.8), station(2, 48.851, 1.7), station(3, 48.852, 1.9)],
      '2026-10-19T08:00:00.000Z',
    )
    repo.replaceBrands(
      new Map([
        [1, { name: 'E.Leclerc', raw: 'Leclerc' }],
        [2, { name: 'TotalEnergies', raw: 'Total' }],
      ]),
      '2026-10-19T08:00:00.000Z',
    )
    return { repo, app: await buildApp({ repository: repo }) }
  }
  const base = '/stations?lat=48.85&lon=2.35&fuel=e10&radiusKm=5'

  it('returns the brand on each result, null when unknown', async () => {
    const { repo, app } = await setup()
    const data = (await app.inject(base)).json().data as { id: number; brand: string | null }[]
    expect(Object.fromEntries(data.map((s) => [s.id, s.brand]))).toEqual({
      1: 'E.Leclerc',
      2: 'TotalEnergies',
      3: null,
    })
    repo.close()
  })

  it('filters by brand, in any order, without mixing cached answers', async () => {
    const { repo, app } = await setup()
    const only = (await app.inject(`${base}&brands=E.Leclerc`)).json().data as { id: number }[]
    expect(only.map((s) => s.id)).toEqual([1])
    const two = (await app.inject(`${base}&brands=TotalEnergies,E.Leclerc`)).json().data as {
      id: number
    }[]
    expect(two.map((s) => s.id).sort()).toEqual([1, 2])
    expect((await app.inject(base)).json().data).toHaveLength(3)
    repo.close()
  })

  it('rejects too many brands', async () => {
    const { repo, app } = await setup()
    const many = Array.from({ length: 11 }, (_, i) => `B${i}`).join(',')
    expect((await app.inject(`${base}&brands=${many}`)).statusCode).toBe(400)
    repo.close()
  })

  it('lists brands around a point with the OSM credit', async () => {
    const { repo, app } = await setup()
    const res = (await app.inject('/brands?lat=48.85&lon=2.35&fuel=e10&radiusKm=5')).json()
    expect(res.data.map((b: { brand: string }) => b.brand).sort()).toEqual([
      'E.Leclerc',
      'TotalEnergies',
    ])
    expect(res.data[0]).toMatchObject({ count: 1 })
    expect(res.meta.attribution).toContain('OpenStreetMap')
    repo.close()
  })

  it('shows the brand on the station sheet', async () => {
    const { repo, app } = await setup()
    expect((await app.inject('/stations/1')).json().data.brand).toBe('E.Leclerc')
    expect((await app.inject('/stations/3')).json().data.brand).toBeNull()
    repo.close()
  })
})

describe('fetchOsmBrands', () => {
  const body = JSON.stringify({
    elements: [{ tags: { 'ref:FR:prix-carburants': '5', brand: 'Esso' } }],
  })

  it('tries the next server when one is busy', async () => {
    const calls: string[] = []
    const fetchImpl: typeof fetch = async (input) => {
      calls.push(input instanceof Request ? input.url : String(input))
      return calls.length === 1 ? new Response('busy', { status: 502 }) : new Response(body)
    }
    const map = await fetchOsmBrands(fetchImpl, ['http://a', 'http://b'], 0)
    expect(calls).toEqual(['http://a', 'http://b'])
    expect(map.get(5)?.name).toBe('Esso')
  })

  it('reports the last failure after the last attempt', async () => {
    const fetchImpl: typeof fetch = async () => new Response('', { status: 504 })
    await expect(fetchOsmBrands(fetchImpl, ['http://a'], 0)).rejects.toThrow('HTTP 504')
  })
})
