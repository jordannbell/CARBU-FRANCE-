export interface LatLon {
  readonly latitude: number
  readonly longitude: number
}

export interface RouteResult {
  readonly distanceMeters: number
  readonly durationSeconds: number
  /** Simplified driving path from origin to destination, in order. */
  readonly path: readonly LatLon[]
  /** Which service computed the route, so the right credit is shown. */
  readonly provider?: RouteProvider
}

export type RouteProvider = 'openrouteservice' | 'osrm'

export type RoutingFailure = 'unavailable' | 'busy' | 'no-route' | 'too-far' | 'failed'

/** Expected failure of the routing provider; the HTTP layer maps each kind to a status code. */
export class RoutingError extends Error {
  constructor(
    readonly kind: RoutingFailure,
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options)
    this.name = 'RoutingError'
  }
}

export interface RoutingPort {
  getRoute(from: LatLon, to: LatLon): Promise<RouteResult>
}

export const ROUTING_ATTRIBUTION = '© openrouteservice.org by HeiGIT | © OpenStreetMap contributors'
export const OSRM_ATTRIBUTION =
  '© OpenStreetMap contributors | Routage : OSRM (serveur de démonstration)'

export const attributionFor = (provider: RouteProvider | undefined): string =>
  provider === 'osrm' ? OSRM_ATTRIBUTION : ROUTING_ATTRIBUTION
