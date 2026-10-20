import { z } from 'zod'
import { simplifyPath } from './simplify'
import { RoutingError, type LatLon, type RouteResult, type RoutingPort } from './types'

// Fixed endpoint: never built from user input, so the key cannot be sent anywhere else.
// api.heigit.org is the provider's current host. The older api.openrouteservice.org still
// accepts the same key but left most requests unanswered when measured (2 of 12 succeeded).
export const ORS_DIRECTIONS_URL =
  'https://api.heigit.org/openrouteservice/v2/directions/driving-car/geojson'

// The provider is sometimes slow to answer a request that works instantly when repeated, so a
// network failure or timeout is retried once with a short timeout instead of one long wait.
// The total budget must stay below the server's own connection timeout (see app.ts), otherwise
// the socket is closed before the error response can be written.
const ATTEMPT_TIMEOUT_MS = 6_000
const MAX_ATTEMPTS = 2
export const ORS_TOTAL_BUDGET_MS = ATTEMPT_TIMEOUT_MS * MAX_ATTEMPTS
const MAX_BODY_BYTES = 5 * 1024 * 1024
const MAX_PATH_POINTS = 50_000

const orsResponseSchema = z.object({
  features: z
    .array(
      z.object({
        geometry: z.object({
          // Each position is [longitude, latitude] with an optional elevation.
          coordinates: z.array(z.array(z.number()).min(2)).min(2).max(MAX_PATH_POINTS),
        }),
        properties: z.object({
          summary: z.object({
            distance: z.number().nonnegative(),
            duration: z.number().nonnegative(),
          }),
        }),
      }),
    )
    .min(1),
})

function failureForStatus(status: number): RoutingError {
  if (status === 429) return new RoutingError('busy', 'Routing provider quota reached')
  // 400/404: the provider could not snap a point to the road network or find a path.
  if (status === 400 || status === 404) return new RoutingError('no-route', 'No route found')
  // 401/403 means a bad key: a server configuration problem, not the user's.
  return new RoutingError('failed', `Routing provider error (HTTP ${status})`)
}

async function readBounded(response: Response): Promise<unknown> {
  if (Number(response.headers.get('content-length') ?? 0) > MAX_BODY_BYTES) {
    throw new RoutingError('failed', 'Routing response too large')
  }
  const text = await response.text()
  if (text.length > MAX_BODY_BYTES) throw new RoutingError('failed', 'Routing response too large')
  try {
    return JSON.parse(text) as unknown
  } catch (cause) {
    throw new RoutingError('failed', 'Routing response is not JSON', { cause })
  }
}

export interface OrsOptions {
  /** Tries per request (a network failure or timeout is retried). Default 2. */
  readonly attempts?: number
  /** Timeout of each try. Default 6 s. */
  readonly attemptTimeoutMs?: number
}

export function createOrsRouting(
  apiKey: string,
  fetchImpl: typeof fetch = fetch,
  url: string = ORS_DIRECTIONS_URL,
  options: OrsOptions = {},
): RoutingPort {
  const attempts = options.attempts ?? MAX_ATTEMPTS
  const attemptTimeoutMs = options.attemptTimeoutMs ?? ATTEMPT_TIMEOUT_MS
  return {
    async getRoute(from: LatLon, to: LatLon): Promise<RouteResult> {
      const init = {
        method: 'POST',
        headers: {
          Authorization: apiKey,
          'Content-Type': 'application/json',
          Accept: 'application/geo+json',
        },
        body: JSON.stringify({
          coordinates: [
            [from.longitude, from.latitude],
            [to.longitude, to.latitude],
          ],
          instructions: false,
        }),
        redirect: 'error' as const,
      }

      let response: Response | undefined
      let lastCause: unknown
      for (let attempt = 1; attempt <= attempts && response === undefined; attempt += 1) {
        try {
          response = await fetchImpl(url, {
            ...init,
            signal: AbortSignal.timeout(attemptTimeoutMs),
          })
        } catch (cause) {
          lastCause = cause
        }
      }
      if (response === undefined) {
        throw new RoutingError('failed', 'Routing provider unreachable', { cause: lastCause })
      }

      if (!response.ok) throw failureForStatus(response.status)

      const parsed = orsResponseSchema.safeParse(await readBounded(response))
      const feature = parsed.success ? parsed.data.features[0] : undefined
      if (!feature) throw new RoutingError('failed', 'Unexpected routing response')

      const path = feature.geometry.coordinates.flatMap(([longitude, latitude]) =>
        longitude !== undefined && latitude !== undefined ? [{ latitude, longitude }] : [],
      )
      return {
        distanceMeters: Math.round(feature.properties.summary.distance),
        durationSeconds: Math.round(feature.properties.summary.duration),
        path: simplifyPath(path),
        provider: 'openrouteservice' as const,
      }
    },
  }
}
