import { RoutingError, type LatLon, type RouteResult, type RoutingPort } from './types'

/**
 * Caps the number of calls a provider receives per UTC day, below its free quota. When the budget
 * is spent it answers "busy" without calling the provider, so a fallback can take over.
 * Place it around the quota-limited provider only, and inside the cache so cache hits are free.
 */
export function withDailyBudget(
  provider: RoutingPort,
  options: { dailyBudget: number; now?: () => number },
): RoutingPort {
  const now = options.now ?? Date.now
  let budgetDay = ''
  let used = 0

  return {
    getRoute(from: LatLon, to: LatLon): Promise<RouteResult> {
      const day = new Date(now()).toISOString().slice(0, 10)
      if (day !== budgetDay) {
        budgetDay = day
        used = 0
      }
      if (used >= options.dailyBudget) {
        return Promise.reject(new RoutingError('busy', 'Daily routing budget used'))
      }
      used += 1
      return provider.getRoute(from, to)
    },
  }
}
