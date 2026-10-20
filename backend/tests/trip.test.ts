import { describe, expect, it } from 'vitest'
import { buildApp } from '../src/app'
import { StationRepository } from '../src/db/stationRepository'
import type { Station } from '../src/domain'
import { distanceToPathKm, pathBounds } from '../src/geo'
import { RoutingError, type RoutingPort } from '../src/routing/types'

const station = (id: number, latitude: number, longitude: number, price: number): Station => ({
  id,
  latitude,
  longitude,
  address: `${id} rue Test`,
  city: 'Paris',
  postalCode: '75001',
  departmentCode: '75',
  open24h: false,
  services: [],
  hours: [],
  prices: [{ fuel: 'gazole', price, updatedAt: '2026-10-19T08:00:00.000Z' }],
  shortages: [],
})

// A straight west-east road at latitude 48.85, from longitude 2.30 to 2.50.
const PATH = [
  { latitude: 48.85, longitude: 2.3 },
  { latitude: 48.85, longitude: 2.4 },
  { latitude: 48.85, longitude: 2.5 },
]
const routing: RoutingPort = {
  getRoute: async () => ({
    distanceMeters: 14_000,
    durationSeconds: 1_200,
    path: PATH,
    provider: 'osrm',
  }),
}

const setup = async (port: RoutingPort | null = routing) => {
  const repo = new StationRepository(':memory:')
  repo.replaceAll(
    [
      station(1, 48.85, 2.4, 1.9), // on the road
      station(2, 48.859, 2.42, 1.7), // about 1 km north of the road
      station(3, 48.95, 2.4, 1.5), // about 11 km north: out of the corridor
      station(4, 48.85, 2.45, 1.8), // on the road
    ],
    '2026-10-19T08:00:00.000Z',
  )
  repo.replaceBrands(new Map([[4, { name: 'Esso', raw: 'Esso' }]]), '2026-10-19T08:00:00.000Z')
  return { repo, app: await buildApp({ repository: repo, routing: port ?? undefined }) }
}

const TRIP = '/trip/stations?lat=48.85&lon=2.3&toLat=48.85&toLon=2.5&fuel=gazole'

describe('GET /trip/stations', () => {
  it('keeps the stations inside the corridor, cheapest first, with the route', async () => {
    const { repo, app } = await setup()
    const res = (await app.inject(TRIP)).json()
    expect(res.data.stations.map((s: { id: number }) => s.id)).toEqual([2, 4, 1])
    expect(res.data.stations[0].offRouteKm).toBeGreaterThan(0.5)
    expect(res.data.stations[0].offRouteKm).toBeLessThan(1.5)
    expect(res.data.route.path).toHaveLength(3)
    expect(res.meta).toMatchObject({ count: 3, total: 3, truncated: false, corridorKm: 2 })
    expect(res.meta.attribution).toContain('OSRM')
    repo.close()
  })

  it('narrows the corridor', async () => {
    const { repo, app } = await setup()
    const res = (await app.inject(`${TRIP}&corridorKm=1`)).json()
    expect(res.data.stations.map((s: { id: number }) => s.id).sort()).toEqual([1, 4])
    repo.close()
  })

  it('sorts by distance to the road, and cuts at the limit', async () => {
    const { repo, app } = await setup()
    const res = (await app.inject(`${TRIP}&sort=distance&limit=2`)).json()
    expect(res.data.stations).toHaveLength(2)
    const [near, far] = res.data.stations as { offRouteKm: number }[]
    expect(near?.offRouteKm).toBeLessThanOrEqual(far?.offRouteKm ?? 0)
    expect(res.meta).toMatchObject({ count: 2, total: 3, truncated: true })
    repo.close()
  })

  it('combines with the brand filter', async () => {
    const { repo, app } = await setup()
    const res = (await app.inject(`${TRIP}&brands=Esso`)).json()
    expect(res.data.stations.map((s: { id: number }) => s.id)).toEqual([4])
    repo.close()
  })

  it('answers an empty corridor with an empty list', async () => {
    const { repo, app } = await setup({
      getRoute: async () => ({
        distanceMeters: 1,
        durationSeconds: 1,
        path: [
          { latitude: 44, longitude: 3 },
          { latitude: 44.1, longitude: 3.1 },
        ],
      }),
    })
    const res = (await app.inject(TRIP)).json()
    expect(res.data.stations).toEqual([])
    expect(res.meta.total).toBe(0)
    repo.close()
  })

  it.each([
    [
      'a destination outside France',
      '/trip/stations?lat=48.85&lon=2.3&toLat=40.7&toLon=-74&fuel=gazole',
    ],
    ['a missing destination', '/trip/stations?lat=48.85&lon=2.3&toLat=48.85&fuel=gazole'],
    ['a bad fuel', '/trip/stations?lat=48.85&lon=2.3&toLat=48.85&toLon=2.5&fuel=diesel'],
  ])('rejects %s', async (_name, url) => {
    const { repo, app } = await setup()
    expect((await app.inject(url)).statusCode).toBe(400)
    repo.close()
  })

  it('answers 503 without a routing provider', async () => {
    const { repo, app } = await setup(null)
    expect((await app.inject(TRIP)).statusCode).toBe(503)
    repo.close()
  })

  it.each([
    ['no-route', 422],
    ['too-far', 400],
    ['busy', 503],
    ['failed', 502],
  ] as const)('maps a %s routing failure to HTTP %i', async (kind, status) => {
    const { repo, app } = await setup({
      getRoute: async () => {
        throw new RoutingError(kind, 'down')
      },
    })
    expect((await app.inject(TRIP)).statusCode).toBe(status)
    repo.close()
  })
})

describe('path geometry', () => {
  it('measures the distance from a point to the nearest part of a path', () => {
    expect(distanceToPathKm({ latitude: 48.85, longitude: 2.4 }, PATH)).toBeLessThan(0.001)
    const north = distanceToPathKm({ latitude: 48.859, longitude: 2.4 }, PATH)
    expect(north).toBeGreaterThan(0.95)
    expect(north).toBeLessThan(1.05)
    // Beyond the end of the path the nearest point is the end itself.
    const beyond = distanceToPathKm({ latitude: 48.85, longitude: 2.6 }, PATH)
    expect(beyond).toBeGreaterThan(7)
    expect(distanceToPathKm({ latitude: 48.85, longitude: 2.4 }, [])).toBe(Infinity)
  })

  it('draws a box around a path, widened by the margin', () => {
    const box = pathBounds(PATH, 2)
    expect(box.minLongitude).toBeLessThan(2.3)
    expect(box.maxLongitude).toBeGreaterThan(2.5)
    expect(box.minLatitude).toBeLessThan(48.85)
    expect(box.maxLatitude).toBeGreaterThan(48.85)
  })
})
