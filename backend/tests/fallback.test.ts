import { describe, expect, it, vi } from 'vitest'
import { buildApp } from '../src/app'
import { StationRepository } from '../src/db/stationRepository'
import { withFallback } from '../src/routing/fallback'
import { createOsrmRouting } from '../src/routing/osrm'
import {
  OSRM_ATTRIBUTION,
  ROUTING_ATTRIBUTION,
  RoutingError,
  attributionFor,
  type RouteResult,
  type RoutingPort,
} from '../src/routing/types'

const FROM = { latitude: 48.8566, longitude: 2.3522 }
const TO = { latitude: 48.87, longitude: 2.37 }

const osrmBody = {
  code: 'Ok',
  routes: [
    {
      distance: 3751.8,
      duration: 673.1,
      geometry: {
        coordinates: [
          [2.3522, 48.8566],
          [2.37, 48.87],
        ],
      },
    },
  ],
}

describe('createOsrmRouting', () => {
  it('returns distance, duration and a [lat, lon] path, and names itself as the provider', async () => {
    const route = await createOsrmRouting(
      async () => new Response(JSON.stringify(osrmBody)),
    ).getRoute(FROM, TO)
    expect(route).toMatchObject({ distanceMeters: 3752, durationSeconds: 673, provider: 'osrm' })
    expect(route.path[0]).toEqual({ latitude: 48.8566, longitude: 2.3522 })
  })

  it('puts longitude first in the URL, as OSRM expects, and asks for GeoJSON', async () => {
    let requested = ''
    const spy: typeof fetch = async (input) => {
      requested = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
      return new Response(JSON.stringify(osrmBody))
    }
    await createOsrmRouting(spy).getRoute(FROM, TO)
    expect(requested).toContain('/2.3522,48.8566;2.37,48.87?')
    expect(requested).toContain('geometries=geojson')
    expect(requested.startsWith('https://router.project-osrm.org/')).toBe(true)
  })

  it.each([
    [429, 'busy'],
    [400, 'no-route'],
    [500, 'failed'],
  ])('maps HTTP %i to %s', async (status, kind) => {
    const answer = async () => new Response('{}', { status })
    await expect(createOsrmRouting(answer).getRoute(FROM, TO)).rejects.toMatchObject({ kind })
  })

  it('maps an OSRM "NoRoute" answer to no-route, and nonsense to failed', async () => {
    const noRoute = async () => new Response(JSON.stringify({ code: 'NoRoute' }))
    await expect(createOsrmRouting(noRoute).getRoute(FROM, TO)).rejects.toMatchObject({
      kind: 'no-route',
    })
    const nonsense = async () => new Response(JSON.stringify({ code: 'Ok' }))
    await expect(createOsrmRouting(nonsense).getRoute(FROM, TO)).rejects.toMatchObject({
      kind: 'failed',
    })
  })

  it('reports an unreachable server as failed', async () => {
    const down: typeof fetch = async () => {
      throw new TypeError('network')
    }
    await expect(createOsrmRouting(down).getRoute(FROM, TO)).rejects.toMatchObject({
      kind: 'failed',
    })
  })
})

describe('withFallback', () => {
  const route = (provider: 'openrouteservice' | 'osrm'): RouteResult => ({
    distanceMeters: 1,
    durationSeconds: 1,
    path: [],
    provider,
  })
  const working = (provider: 'openrouteservice' | 'osrm') => {
    const calls = { n: 0 }
    const port: RoutingPort = {
      getRoute: async () => {
        calls.n += 1
        return route(provider)
      },
    }
    return { port, calls }
  }
  const broken = (kind: RoutingError['kind'] = 'failed') => {
    const calls = { n: 0 }
    const port: RoutingPort = {
      getRoute: async () => {
        calls.n += 1
        throw new RoutingError(kind, 'down')
      },
    }
    return { port, calls }
  }

  it('uses the primary when it works', async () => {
    const primary = working('openrouteservice')
    const secondary = working('osrm')
    const result = await withFallback(primary.port, secondary.port).getRoute(FROM, TO)
    expect(result.provider).toBe('openrouteservice')
    expect(secondary.calls.n).toBe(0)
  })

  it('switches to the secondary when the primary fails, and tells why', async () => {
    const onFallback = vi.fn()
    const result = await withFallback(broken().port, working('osrm').port, { onFallback }).getRoute(
      FROM,
      TO,
    )
    expect(result.provider).toBe('osrm')
    expect(onFallback).toHaveBeenCalledWith('failed')
  })

  it.each(['busy', 'unavailable'] as const)('also falls back on a %s primary', async (kind) => {
    const result = await withFallback(broken(kind).port, working('osrm').port).getRoute(FROM, TO)
    expect(result.provider).toBe('osrm')
  })

  it.each(['no-route', 'too-far'] as const)(
    'does not fall back on %s: the answer would be the same',
    async (kind) => {
      const secondary = working('osrm')
      await expect(
        withFallback(broken(kind).port, secondary.port).getRoute(FROM, TO),
      ).rejects.toMatchObject({ kind })
      expect(secondary.calls.n).toBe(0)
    },
  )

  it('stops trying a failing primary for a while, then tries it again', async () => {
    let now = 1_000
    const primary = broken()
    const secondary = working('osrm')
    const guarded = withFallback(primary.port, secondary.port, {
      now: () => now,
      failuresBeforeSkipping: 2,
      skipMs: 60_000,
    })
    await guarded.getRoute(FROM, TO)
    await guarded.getRoute(FROM, TO) // second failure: the primary is now skipped
    expect(primary.calls.n).toBe(2)

    await guarded.getRoute(FROM, TO)
    await guarded.getRoute(FROM, TO)
    expect(primary.calls.n).toBe(2) // not called during the cool-down
    expect(secondary.calls.n).toBe(4)

    now += 60_001
    await guarded.getRoute(FROM, TO)
    expect(primary.calls.n).toBe(3) // tried again
  })

  it('a success resets the failure count', async () => {
    let healthy = false
    const flaky: RoutingPort = {
      getRoute: async () => {
        if (!healthy) throw new RoutingError('failed', 'down')
        return route('openrouteservice')
      },
    }
    const secondary = working('osrm')
    const guarded = withFallback(flaky, secondary.port, { failuresBeforeSkipping: 2 })
    await guarded.getRoute(FROM, TO) // failure 1
    healthy = true
    await guarded.getRoute(FROM, TO) // success: count back to 0
    healthy = false
    await guarded.getRoute(FROM, TO) // failure 1 again, not 2
    healthy = true
    expect((await guarded.getRoute(FROM, TO)).provider).toBe('openrouteservice')
  })

  it('reports the secondary error when both providers fail', async () => {
    await expect(
      withFallback(broken('failed').port, broken('busy').port).getRoute(FROM, TO),
    ).rejects.toMatchObject({ kind: 'busy' })
  })

  it('does not hide programming errors behind a fallback', async () => {
    const buggy: RoutingPort = {
      getRoute: async () => {
        throw new TypeError('bug')
      },
    }
    await expect(withFallback(buggy, working('osrm').port).getRoute(FROM, TO)).rejects.toThrow(
      'bug',
    )
  })
})

describe('credit follows the provider that answered', () => {
  it('names OpenRouteService or OSRM', () => {
    expect(attributionFor('openrouteservice')).toBe(ROUTING_ATTRIBUTION)
    expect(attributionFor('osrm')).toBe(OSRM_ATTRIBUTION)
    expect(attributionFor(undefined)).toBe(ROUTING_ATTRIBUTION)
  })

  it('is returned by the API with the route', async () => {
    const repository = new StationRepository(':memory:')
    repository.replaceAll(
      [
        {
          id: 7,
          latitude: 48.87,
          longitude: 2.37,
          address: 'a',
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
    const routing: RoutingPort = {
      getRoute: async () => ({ distanceMeters: 1, durationSeconds: 1, path: [], provider: 'osrm' }),
    }
    const res = await (
      await buildApp({ repository, routing })
    ).inject('/stations/7/route?lat=48.85&lon=2.35')
    expect(res.json().meta.attribution).toBe(OSRM_ATTRIBUTION)
    expect(res.json().data.provider).toBe('osrm')
    repository.close()
  })
})
