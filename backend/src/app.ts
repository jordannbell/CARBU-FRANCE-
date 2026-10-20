import cors from '@fastify/cors'
import helmet from '@fastify/helmet'
import rateLimit from '@fastify/rate-limit'
import Fastify, { type FastifyError, type FastifyInstance } from 'fastify'
import type { AlertStore } from './alerts/store'
import type { StationReader } from './domain'
import type { GeocoderPort } from './geocoding/ign'
import { CLIENT_ERRORS, fail, ok } from './http'
import { registerAlertRoutes } from './routes/alerts'
import { registerPlacesRoute } from './routes/places'
import { registerRouteRoute } from './routes/route'
import { registerTripRoute } from './routes/trip'
import { registerStationRoutes } from './routes/stations'
import type { RoutingPort } from './routing/types'

const BODY_LIMIT_BYTES = 1_024
// Must stay above the slowest legitimate handler (a route lookup, see ORS_TOTAL_BUDGET_MS):
// when the socket times out first, the client sees a dropped connection instead of our error.
export const SERVER_TIMEOUT_MS = 20_000
const CONNECTION_TIMEOUT_MS = SERVER_TIMEOUT_MS
const REQUEST_TIMEOUT_MS = SERVER_TIMEOUT_MS
const DEFAULT_RATE_LIMIT = 60
const DEFAULT_ROUTE_RATE_LIMIT = 10
const DEFAULT_PLACES_RATE_LIMIT = 30
const DEFAULT_ALERTS_RATE_LIMIT = 30

/**
 * A number means "trust this many proxies in front of the API": only those hops of
 * X-Forwarded-For are believed, so a client cannot invent its own address to dodge rate limits.
 * (Fastify's typings only list booleans and functions, hence the explicit function.)
 */
function resolveTrustProxy(
  value: boolean | number | undefined,
): boolean | ((address: string, hop: number) => boolean) {
  if (typeof value === 'number') return value > 0 ? (_address, hop) => hop < value : false
  return value ?? false
}

export interface AppOptions {
  readonly repository: StationReader
  readonly now?: () => Date
  readonly corsOrigins?: readonly string[]
  readonly rateLimitPerMinute?: number
  /** Stricter limit for /stations/:id/route, which spends a third-party quota. */
  readonly routeRateLimitPerMinute?: number
  /** Routing provider. When missing, the route endpoint answers 503. */
  readonly routing?: RoutingPort
  /** Address search provider. When missing, /places answers 503. */
  readonly geocoder?: GeocoderPort
  readonly placesRateLimitPerMinute?: number
  /** Price alerts. When missing, the alert endpoints answer 503. */
  readonly alerts?: AlertStore
  readonly alertsRateLimitPerMinute?: number
  /** Number of trusted reverse-proxy hops (false/0 = none). */
  readonly trustProxy?: boolean | number
  readonly logLevel?: 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'silent'
}

export async function buildApp(options: AppOptions): Promise<FastifyInstance> {
  const { repository, now = () => new Date() } = options
  const app = Fastify({
    logger: {
      level: options.logLevel ?? 'silent',
      // Log method and path only: the query string carries the user's location.
      serializers: {
        req: (req) => ({ method: req.method, path: req.url?.split('?')[0] }),
      },
    },
    bodyLimit: BODY_LIMIT_BYTES,
    connectionTimeout: CONNECTION_TIMEOUT_MS,
    requestTimeout: REQUEST_TIMEOUT_MS,
    trustProxy: resolveTrustProxy(options.trustProxy),
  })

  await app.register(helmet, { contentSecurityPolicy: { directives: { defaultSrc: ["'none'"] } } })
  await app.register(cors, {
    origin:
      options.corsOrigins && options.corsOrigins.length > 0 ? [...options.corsOrigins] : false,
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
  })
  await app.register(rateLimit, {
    max: options.rateLimitPerMinute ?? DEFAULT_RATE_LIMIT,
    timeWindow: '1 minute',
    errorResponseBuilder: () => ({
      statusCode: 429,
      error: 'Too Many Requests',
      message: 'Too many requests, retry later',
    }),
  })

  app.setNotFoundHandler((_request, reply) =>
    reply.code(404).send(fail('NOT_FOUND', 'Route not found')),
  )
  app.setErrorHandler((error: FastifyError, request, reply) => {
    const status = typeof error.statusCode === 'number' ? error.statusCode : 500
    if (status >= 400 && status < 500) {
      const known = CLIENT_ERRORS[status]
      return reply
        .code(status)
        .send(fail(known?.code ?? 'BAD_REQUEST', known?.message ?? 'Bad request'))
    }
    request.log.error({ err: error }, 'unhandled error')
    return reply.code(500).send(fail('INTERNAL', 'Internal server error'))
  })

  app.get('/health', () =>
    ok({ stations: repository.count() }, { lastIngestedAt: repository.lastIngestedAt() }),
  )

  registerStationRoutes(app, { repository, now })
  registerRouteRoute(app, {
    repository,
    routing: options.routing,
    rateLimitPerMinute: options.routeRateLimitPerMinute ?? DEFAULT_ROUTE_RATE_LIMIT,
  })

  registerTripRoute(app, {
    repository,
    routing: options.routing,
    rateLimitPerMinute: options.routeRateLimitPerMinute ?? DEFAULT_ROUTE_RATE_LIMIT,
    now,
  })

  registerPlacesRoute(app, {
    geocoder: options.geocoder,
    rateLimitPerMinute: options.placesRateLimitPerMinute ?? DEFAULT_PLACES_RATE_LIMIT,
    now,
  })

  registerAlertRoutes(app, {
    alerts: options.alerts,
    repository,
    rateLimitPerMinute: options.alertsRateLimitPerMinute ?? DEFAULT_ALERTS_RATE_LIMIT,
    now,
  })

  return app
}
