import { RoutingError, type LatLon, type RouteResult, type RoutingPort } from './types'

const FAILURES_BEFORE_SKIPPING = 2
const SKIP_PRIMARY_MS = 60_000

// Failures that say "this provider is not answering", as opposed to "there is no road".
// A missing route or a too-distant station is the same whatever the provider.
const isProviderProblem = (error: unknown): boolean =>
  error instanceof RoutingError &&
  (error.kind === 'failed' || error.kind === 'busy' || error.kind === 'unavailable')

/**
 * Uses `primary`, and switches to `secondary` when the primary is down. After a few failures in a
 * row the primary is skipped for a minute (a circuit breaker), so users do not wait for a
 * provider that is known to be unresponsive; it is then tried again.
 */
export function withFallback(
  primary: RoutingPort,
  secondary: RoutingPort,
  options: {
    now?: () => number
    failuresBeforeSkipping?: number
    skipMs?: number
    onFallback?: (reason: string) => void
  } = {},
): RoutingPort {
  const now = options.now ?? Date.now
  const threshold = options.failuresBeforeSkipping ?? FAILURES_BEFORE_SKIPPING
  const skipMs = options.skipMs ?? SKIP_PRIMARY_MS
  let failures = 0
  let skipUntil = 0

  return {
    async getRoute(from: LatLon, to: LatLon): Promise<RouteResult> {
      if (now() < skipUntil) return secondary.getRoute(from, to)

      try {
        const route = await primary.getRoute(from, to)
        failures = 0
        return route
      } catch (error) {
        if (!isProviderProblem(error)) throw error
        failures += 1
        if (failures >= threshold) {
          skipUntil = now() + skipMs
          failures = 0
        }
        options.onFallback?.(error instanceof RoutingError ? error.kind : 'unknown')
        return secondary.getRoute(from, to)
      }
    },
  }
}
