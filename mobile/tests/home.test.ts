import { describe, expect, it } from 'vitest'
import { fetchTrip } from '../src/api'
import { isSameLocalDay } from '../src/format'
import { BRAND_GROUP_COLORS, brandMonogram } from '../src/logic/brandStyle'
import { regionAround, regionToArea } from '../src/logic/region'

describe('regionToArea', () => {
  it('turns a map region into a box and keeps small views as they are', () => {
    const area = regionToArea({
      latitude: 48.85,
      longitude: 2.35,
      latitudeDelta: 0.1,
      longitudeDelta: 0.1,
    })
    expect(area.clamped).toBe(false)
    expect(area.bounds.minLatitude).toBeCloseTo(48.8, 5)
    expect(area.bounds.maxLatitude).toBeCloseTo(48.9, 5)
    expect(area.bounds.minLongitude).toBeCloseTo(2.3, 5)
    expect(area.bounds.maxLongitude).toBeCloseTo(2.4, 5)
  })

  it('shrinks a view wider than a search allows, around its centre', () => {
    const area = regionToArea({
      latitude: 46.5,
      longitude: 2.5,
      latitudeDelta: 10,
      longitudeDelta: 10,
    })
    expect(area.clamped).toBe(true)
    const height = area.bounds.maxLatitude - area.bounds.minLatitude
    expect(height).toBeLessThan(1.2)
    expect((area.bounds.maxLatitude + area.bounds.minLatitude) / 2).toBeCloseTo(46.5, 5)
  })

  it('never goes past the poles or the date line', () => {
    const area = regionToArea({
      latitude: 89.9,
      longitude: 179.9,
      latitudeDelta: 0.5,
      longitudeDelta: 0.5,
    })
    expect(area.bounds.maxLatitude).toBeLessThanOrEqual(90)
    expect(area.bounds.maxLongitude).toBeLessThanOrEqual(180)
  })

  it('builds a region around a point', () => {
    const region = regionAround({ latitude: 48.85, longitude: 2.35 }, 5)
    expect(region.latitudeDelta).toBeCloseTo(10 / 111.32, 5)
    expect(region.longitudeDelta).toBeGreaterThan(region.latitudeDelta)
  })
})

describe('brand badge', () => {
  it.each([
    ['E.Leclerc', 'EL'],
    ['TotalEnergies', 'TE'],
    ['Système U', 'SU'],
    ['Esso', 'E'],
    ['Carrefour', 'C'],
    ['', '?'],
  ])('writes "%s" as "%s"', (brand, letters) => {
    expect(brandMonogram(brand)).toBe(letters)
  })

  // WCAG relative luminance: white text on each group colour must stay readable.
  const luminance = (hex: string): number => {
    const channel = (start: number): number => {
      const value = parseInt(hex.slice(start, start + 2), 16) / 255
      return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
    }
    return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5)
  }
  it.each(Object.entries(BRAND_GROUP_COLORS))(
    'white text on the %s colour reaches 4.5:1',
    (_g, hex) => {
      expect(1.05 / (luminance(hex) + 0.05)).toBeGreaterThanOrEqual(4.5)
    },
  )
})

describe('isSameLocalDay', () => {
  it('compares calendar days in the local time zone', () => {
    const now = new Date(2026, 9, 19, 15, 0)
    expect(isSameLocalDay(new Date(2026, 9, 19, 0, 5).toISOString(), now)).toBe(true)
    expect(isSameLocalDay(new Date(2026, 9, 18, 23, 59).toISOString(), now)).toBe(false)
    expect(isSameLocalDay('not a date', now)).toBe(false)
  })
})

describe('fetchTrip', () => {
  const station = {
    id: 1,
    brand: 'Esso',
    brandGroup: 'oil',
    address: 'a',
    city: 'Paris',
    postalCode: '75001',
    latitude: 48.8,
    longitude: 2.3,
    open24h: false,
    services: [],
    fuel: 'gazole',
    price: 1.8,
    updatedAt: '2026-10-19T08:00:00Z',
    stale: false,
    shortage: null,
    distanceKm: 1,
    offRouteKm: 0.4,
  }
  const body = {
    success: true,
    error: null,
    data: {
      route: {
        distanceMeters: 1000,
        durationSeconds: 120,
        provider: 'osrm',
        path: [
          { latitude: 48.8, longitude: 2.3 },
          { latitude: 48.9, longitude: 2.4 },
        ],
      },
      stations: [station],
    },
    meta: { count: 1, total: 5, truncated: true },
  }
  const params = {
    from: { latitude: 48.8, longitude: 2.3 },
    to: { latitude: 48.9, longitude: 2.4 },
    fuel: 'gazole',
    sort: 'price',
    brands: ['Esso'],
    limit: 60,
  } as const

  it('sends the trip as query parameters and returns the route, stations and totals', async () => {
    let requested = ''
    const fetchImpl: typeof fetch = async (input) => {
      requested = String(input)
      return new Response(JSON.stringify(body))
    }
    const trip = await fetchTrip(params, { baseUrl: 'https://x', fetchImpl })
    const url = new URL(requested)
    expect(url.pathname).toBe('/trip/stations')
    expect(url.searchParams.get('toLat')).toBe('48.9')
    expect(url.searchParams.get('brands')).toBe('Esso')
    expect(trip.stations[0]?.offRouteKm).toBe(0.4)
    expect(trip).toMatchObject({ total: 5, truncated: true })
    expect(trip.route.path).toHaveLength(2)
  })

  it('rejects a trip answer without totals', async () => {
    const { meta: _meta, ...withoutMeta } = body
    const fetchImpl: typeof fetch = async () => new Response(JSON.stringify(withoutMeta))
    await expect(fetchTrip(params, { baseUrl: 'https://x', fetchImpl })).rejects.toThrow(/totals/)
  })
})
