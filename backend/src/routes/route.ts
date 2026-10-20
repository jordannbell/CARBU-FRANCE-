import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import type { StationReader } from '../domain'
import { fail, latitudeParam, longitudeParam, ok, stationIdParam } from '../http'
import { RoutingError, attributionFor, type RoutingPort } from '../routing/types'

const ROUTE_CACHE_CONTROL_SECONDS = 300

const routeQuerySchema = z.object({ lat: latitudeParam, lon: longitudeParam })
const paramsSchema = z.object({ id: stationIdParam })

// How each expected routing failure is reported. Messages are fixed: nothing from the provider.
export const ROUTING_ERRORS: Readonly<
  Record<RoutingError['kind'], { status: number; code: string; message: string }>
> = {
  unavailable: { status: 503, code: 'ROUTING_UNAVAILABLE', message: 'Routing is not available' },
  busy: { status: 503, code: 'ROUTING_BUSY', message: 'Routing is busy, retry later' },
  'no-route': { status: 422, code: 'NO_ROUTE', message: 'No route found to this station' },
  'too-far': { status: 400, code: 'TOO_FAR', message: 'This station is too far for routing' },
  failed: { status: 502, code: 'ROUTING_FAILED', message: 'Routing failed, retry later' },
}

/**
 * The destination is always a station from our own database, never a client-supplied point,
 * so the routing quota cannot be used as an open proxy.
 */
export function registerRouteRoute(
  app: FastifyInstance,
  deps: { repository: StationReader; routing: RoutingPort | undefined; rateLimitPerMinute: number },
): void {
  const { repository, routing, rateLimitPerMinute } = deps

  app.get(
    '/stations/:id/route',
    { config: { rateLimit: { max: rateLimitPerMinute, timeWindow: '1 minute' } } },
    async (request, reply) => {
      const params = paramsSchema.safeParse(request.params)
      const query = routeQuerySchema.safeParse(request.query)
      if (!params.success || !query.success) {
        return reply.code(400).send(fail('INVALID_QUERY', 'Invalid route parameters'))
      }
      const station = repository.findById(params.data.id)
      if (!station) return reply.code(404).send(fail('NOT_FOUND', 'Station not found'))

      try {
        if (!routing) throw new RoutingError('unavailable', 'No routing provider')
        const route = await routing.getRoute(
          { latitude: query.data.lat, longitude: query.data.lon },
          { latitude: station.latitude, longitude: station.longitude },
        )
        reply.header('Cache-Control', `private, max-age=${ROUTE_CACHE_CONTROL_SECONDS}`)
        return ok(route, { attribution: attributionFor(route.provider) })
      } catch (error) {
        if (!(error instanceof RoutingError)) throw error
        const known = ROUTING_ERRORS[error.kind]
        if (error.kind === 'failed') request.log.error({ err: error }, 'routing failed')
        return reply.code(known.status).send(fail(known.code, known.message))
      }
    },
  )
}
