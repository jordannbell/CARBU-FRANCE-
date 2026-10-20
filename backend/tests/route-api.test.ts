import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { buildApp } from '../src/app'
import { StationRepository } from '../src/db/stationRepository'
import { RoutingError, type RoutingPort } from '../src/routing/types'

let repository: StationRepository

beforeEach(() => {
  repository = new StationRepository(':memory:')
  repository.replaceAll(
    [
      {
        id: 7,
        latitude: 48.87,
        longitude: 2.37,
        address: '1 rue X',
        city: 'Paris',
        postalCode: '75001',
        departmentCode: '75',
        open24h: false,
        services: [],
        hours: [],
        prices: [],
        shortages: [],
      },
    ],
    new Date().toISOString(),
  )
})

afterEach(() => repository.close())

const okRouting: RoutingPort = {
  getRoute: async () => ({
    distanceMeters: 2300,
    durationSeconds: 400,
    path: [
      { latitude: 48.8566, longitude: 2.3522 },
      { latitude: 48.87, longitude: 2.37 },
    ],
  }),
}

const URL = '/stations/7/route?lat=48.8566&lon=2.3522'

describe('GET /stations/:id/route', () => {
  it('returns the route and the provider attribution', async () => {
    const app = await buildApp({ repository, routing: okRouting })
    const res = await app.inject(URL)
    expect(res.statusCode).toBe(200)
    expect(res.json()).toMatchObject({
      success: true,
      data: { distanceMeters: 2300, durationSeconds: 400 },
      meta: { attribution: expect.stringContaining('openrouteservice') },
    })
    expect(res.headers['cache-control']).toBe('private, max-age=300')
  })

  it('uses the stored station position as destination, never a client value', async () => {
    let destination: unknown
    const spy: RoutingPort = {
      getRoute: async (_from, to) => {
        destination = to
        return { distanceMeters: 1, durationSeconds: 1, path: [] }
      },
    }
    const app = await buildApp({ repository, routing: spy })
    await app.inject(`${URL}&toLat=0&toLon=0`)
    expect(destination).toEqual({ latitude: 48.87, longitude: 2.37 })
  })

  it('answers 503 when no routing provider is configured', async () => {
    const res = await (await buildApp({ repository })).inject(URL)
    expect(res.statusCode).toBe(503)
    expect(res.json().error.code).toBe('ROUTING_UNAVAILABLE')
  })

  it.each([
    ['busy', 503, 'ROUTING_BUSY'],
    ['no-route', 422, 'NO_ROUTE'],
    ['too-far', 400, 'TOO_FAR'],
    ['failed', 502, 'ROUTING_FAILED'],
  ] as const)('maps a %s failure to %i %s without leaking details', async (kind, status, code) => {
    const failing: RoutingPort = {
      getRoute: async () => {
        throw new RoutingError(kind, 'internal detail with secret-key')
      },
    }
    const res = await (await buildApp({ repository, routing: failing })).inject(URL)
    expect(res.statusCode).toBe(status)
    expect(res.json().error.code).toBe(code)
    expect(res.body).not.toContain('secret-key')
  })

  it('answers 404 for an unknown station', async () => {
    const app = await buildApp({ repository, routing: okRouting })
    const res = await app.inject('/stations/999/route?lat=48.8&lon=2.3')
    expect(res.statusCode).toBe(404)
  })

  it.each([
    ['missing position', '/stations/7/route'],
    ['empty latitude', '/stations/7/route?lat=&lon=2'],
    ['bad id', '/stations/abc/route?lat=48&lon=2'],
  ])('rejects %s with 400', async (_label, url) => {
    const app = await buildApp({ repository, routing: okRouting })
    expect((await app.inject(url)).statusCode).toBe(400)
  })

  it('has its own, stricter rate limit', async () => {
    const app = await buildApp({ repository, routing: okRouting, routeRateLimitPerMinute: 2 })
    const statuses: number[] = []
    for (let i = 0; i < 4; i += 1) statuses.push((await app.inject(URL)).statusCode)
    expect(statuses).toEqual([200, 200, 429, 429])
    // The rest of the API keeps its normal limit.
    expect((await app.inject('/health')).statusCode).toBe(200)
  })

  it('does not rethrow unexpected errors as route details', async () => {
    const crashing: RoutingPort = {
      getRoute: async () => {
        throw new Error('database password leaked here')
      },
    }
    const res = await (await buildApp({ repository, routing: crashing })).inject(URL)
    expect(res.statusCode).toBe(500)
    expect(res.body).not.toContain('database password')
  })
})
