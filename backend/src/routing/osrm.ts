import { z } from 'zod'
import { simplifyPath } from './simplify'
import { RoutingError, type LatLon, type RouteResult, type RoutingPort } from './types'

// Public demonstration server of the OSRM project. No key, but fair use only and no guarantee:
// it is the fallback, not the first choice. Fixed host, never built from user input.
export const OSRM_BASE_URL = 'https://router.project-osrm.org/route/v1/driving'

const REQUEST_TIMEOUT_MS = 5_000
const MAX_BODY_BYTES = 5 * 1024 * 1024
const MAX_PATH_POINTS = 50_000

const osrmResponseSchema = z.object({
  code: z.string(),
  routes: z
    .array(
      z.object({
        distance: z.number().nonnegative(),
        duration: z.number().nonnegative(),
        geometry: z.object({
          // GeoJSON positions: [longitude, latitude]
          coordinates: z.array(z.array(z.number()).min(2)).min(2).max(MAX_PATH_POINTS),
        }),
      }),
    )
    .optional(),
})

export function createOsrmRouting(
  fetchImpl: typeof fetch = fetch,
  baseUrl: string = OSRM_BASE_URL,
  timeoutMs: number = REQUEST_TIMEOUT_MS,
): RoutingPort {
  return {
    async getRoute(from: LatLon, to: LatLon): Promise<RouteResult> {
      const coordinates = `${from.longitude},${from.latitude};${to.longitude},${to.latitude}`
      const url = `${baseUrl}/${coordinates}?overview=full&geometries=geojson&steps=false`

      let response: Response
      try {
        response = await fetchImpl(url, {
          headers: { Accept: 'application/json' },
          signal: AbortSignal.timeout(timeoutMs),
          redirect: 'error',
        })
      } catch (cause) {
        throw new RoutingError('failed', 'Routing fallback unreachable', { cause })
      }

      if (response.status === 429)
        throw new RoutingError('busy', 'Routing fallback is rate limited')
      // OSRM answers 400 with code "NoRoute"/"NoSegment" when it cannot snap or find a path.
      if (response.status === 400) throw new RoutingError('no-route', 'No route found')
      if (!response.ok) {
        throw new RoutingError('failed', `Routing fallback error (HTTP ${response.status})`)
      }
      if (Number(response.headers.get('content-length') ?? 0) > MAX_BODY_BYTES) {
        throw new RoutingError('failed', 'Routing response too large')
      }

      let json: unknown
      try {
        json = JSON.parse(await response.text())
      } catch (cause) {
        throw new RoutingError('failed', 'Routing fallback response is not JSON', { cause })
      }
      const parsed = osrmResponseSchema.safeParse(json)
      if (!parsed.success) throw new RoutingError('failed', 'Unexpected routing fallback response')
      if (parsed.data.code === 'NoRoute' || parsed.data.code === 'NoSegment') {
        throw new RoutingError('no-route', 'No route found')
      }
      const route = parsed.data.code === 'Ok' ? parsed.data.routes?.[0] : undefined
      if (!route) throw new RoutingError('failed', 'Routing fallback returned no route')

      const path = route.geometry.coordinates.flatMap(([longitude, latitude]) =>
        longitude !== undefined && latitude !== undefined ? [{ latitude, longitude }] : [],
      )
      return {
        distanceMeters: Math.round(route.distance),
        durationSeconds: Math.round(route.duration),
        path: simplifyPath(path),
        provider: 'osrm',
      }
    },
  }
}
