import { describe, expect, it } from 'vitest'
import {
  ApiError,
  fetchFavoriteStations,
  fetchPriceHistory,
  fetchStationDetail,
  searchPlaces,
} from '../src/api'

const reply =
  (data: unknown, status = 200) =>
  async () =>
    new Response(JSON.stringify({ success: true, data, error: null }), { status })

const capture = (data: unknown) => {
  const seen: string[] = []
  const impl: typeof fetch = async (input) => {
    seen.push(input instanceof URL ? input.href : typeof input === 'string' ? input : input.url)
    return new Response(JSON.stringify({ success: true, data, error: null }))
  }
  return { seen, impl }
}

const detail = {
  id: 7,
  brand: null,
  latitude: 48.8,
  longitude: 2.3,
  address: 'a',
  city: 'Paris',
  postalCode: '75001',
  departmentCode: '75',
  open24h: false,
  services: ['Station de gonflage'],
  hours: [{ day: 1, closed: false, ranges: [{ open: '07:00', close: '21:00' }] }],
  prices: [{ fuel: 'gazole', price: 1.9, updatedAt: '2026-10-17T08:00:00Z', stale: false }],
  shortages: [],
}

describe('fetchStationDetail', () => {
  it('validates and returns the detail', async () => {
    const { seen, impl } = capture(detail)
    const result = await fetchStationDetail(7, { baseUrl: 'https://x', fetchImpl: impl })
    expect(result.hours[0]?.ranges[0]?.open).toBe('07:00')
    expect(seen).toEqual(['https://x/stations/7'])
  })

  it('rejects a detail that breaks the contract', async () => {
    await expect(
      fetchStationDetail(7, { baseUrl: 'https://x', fetchImpl: reply({ id: 7 }) }),
    ).rejects.toMatchObject({ kind: 'invalid' })
  })

  it('maps a missing station to not-found', async () => {
    const missing: typeof fetch = async () =>
      new Response(
        JSON.stringify({ success: false, data: null, error: { code: 'NOT_FOUND', message: 'x' } }),
        { status: 404 },
      )
    await expect(
      fetchStationDetail(7, { baseUrl: 'https://x', fetchImpl: missing }),
    ).rejects.toMatchObject({ kind: 'not-found' })
  })
})

describe('fetchPriceHistory', () => {
  it('asks for the fuel and window and returns the points', async () => {
    const { seen, impl } = capture({
      fuel: 'gazole',
      days: 30,
      since: '2026-10-01T00:00:00Z',
      points: [{ at: '2026-10-01T00:00:00Z', price: 1.9 }],
    })
    const history = await fetchPriceHistory(7, 'gazole', 30, {
      baseUrl: 'https://x',
      fetchImpl: impl,
    })
    expect(history.points).toHaveLength(1)
    expect(seen).toEqual(['https://x/stations/7/history?fuel=gazole&days=30'])
  })
})

describe('fetchFavoriteStations', () => {
  it('sends the ids, the fuel and only the rounded origin', async () => {
    const { seen, impl } = capture([])
    await fetchFavoriteStations(
      [3, 1, 2],
      { fuel: 'e10', latitude: 48.85, longitude: 2.35 },
      { baseUrl: 'https://x', fetchImpl: impl },
    )
    expect(seen).toEqual(['https://x/stations/by-ids?ids=3%2C1%2C2&fuel=e10&lat=48.85&lon=2.35'])
  })
})

describe('searchPlaces', () => {
  it('returns validated places and encodes the query', async () => {
    const { seen, impl } = capture([
      { label: 'Paris', city: 'Paris', postcode: '75000', latitude: 48.85, longitude: 2.35 },
    ])
    const places = await searchPlaces('8 bd du port & co', {
      baseUrl: 'https://x',
      fetchImpl: impl,
    })
    expect(places[0]?.label).toBe('Paris')
    expect(seen).toEqual(['https://x/places?q=8+bd+du+port+%26+co'])
  })

  it('reports an unavailable provider', async () => {
    const down: typeof fetch = async () =>
      new Response(
        JSON.stringify({
          success: false,
          data: null,
          error: { code: 'GEOCODING_UNAVAILABLE', message: 'x' },
        }),
        { status: 503 },
      )
    const error = await searchPlaces('paris', { baseUrl: 'https://x', fetchImpl: down }).catch(
      (e: unknown) => e,
    )
    expect(error).toBeInstanceOf(ApiError)
    expect((error as ApiError).kind).toBe('unavailable')
  })
})
