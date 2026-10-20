import { haversineKm } from '../geo'
import { TtlCache } from '../ttlCache'
import { RoutingError, type LatLon, type RouteResult, type RoutingPort } from './types'

const MAX_DISTANCE_KM = 150
const CACHE_TTL_MS = 10 * 60_000
const CACHE_MAX_ENTRIES = 1_000
// Same rounding as the station search: ~110 m, the server never uses the exact position.
const COORDINATE_DECIMALS = 3

const round = (value: number): number => {
  const factor = 10 ** COORDINATE_DECIMALS
  return Math.round(value * factor) / factor
}

const roundPoint = (point: LatLon): LatLon => ({
  latitude: round(point.latitude),
  longitude: round(point.longitude),
})

const key = (from: LatLon, to: LatLon): string =>
  `${from.latitude}|${from.longitude}|${to.latitude}|${to.longitude}`

/**
 * Wraps a routing provider with protections that keep a free quota usable:
 * a distance cap, coordinate rounding (privacy and cache hits), and a short-lived cache.
 * Concurrent identical requests share a single upstream call.
 */
export function withGuards(
  provider: RoutingPort,
  options: { now?: () => number } = {},
): RoutingPort {
  const now = options.now ?? Date.now
  const cache = new TtlCache<string, RouteResult>(CACHE_MAX_ENTRIES, CACHE_TTL_MS, now)
  const inFlight = new Map<string, Promise<RouteResult>>()

  return {
    async getRoute(from, to) {
      if (haversineKm(from, to) > MAX_DISTANCE_KM) {
        throw new RoutingError('too-far', `Destination is farther than ${MAX_DISTANCE_KM} km`)
      }
      const start = roundPoint(from)
      const cacheKey = key(start, to)

      const cached = cache.get(cacheKey)
      if (cached) return cached
      const pending = inFlight.get(cacheKey)
      if (pending) return pending

      const request = provider.getRoute(start, to).then((route) => {
        cache.set(cacheKey, route)
        return route
      })
      inFlight.set(cacheKey, request)
      try {
        return await request
      } finally {
        inFlight.delete(cacheKey)
      }
    },
  }
}
