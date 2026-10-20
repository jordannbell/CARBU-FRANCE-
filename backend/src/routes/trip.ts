import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { FUEL_TYPES, type StationReader } from '../domain'
import { distanceToPathKm, pathBounds, type BoundingBox } from '../geo'
import {
  COORDINATE_DECIMALS,
  fail,
  latitudeParam,
  longitudeParam,
  numberParam,
  ok,
  roundTo,
} from '../http'
import { toStationResult } from '../presenters'
import { RoutingError, attributionFor, type RoutingPort } from '../routing/types'
import { ROUTING_ERRORS } from './route'

const CORRIDOR_STEPS_KM = [1, 2, 3, 5] as const
const DEFAULT_CORRIDOR_KM = 2
const MAX_LIMIT = 60
const DEFAULT_LIMIT = 30
const MAX_BRANDS = 10
const MAX_BRAND_LENGTH = 40
const TRIP_CACHE_SECONDS = 300
// Metropolitan France with a margin. The destination is client-supplied, so it is kept inside the
// country the data covers: the routing quota is not an open proxy for the rest of the world.
const FRANCE_BOUNDS: BoundingBox = {
  minLatitude: 41,
  maxLatitude: 51.5,
  minLongitude: -5.8,
  maxLongitude: 10,
}

const corridorKm = (value: number): number =>
  CORRIDOR_STEPS_KM.find((step) => step >= value) ??
  CORRIDOR_STEPS_KM[CORRIDOR_STEPS_KM.length - 1]!

const brandsParam = z
  .string()
  .max(MAX_BRANDS * (MAX_BRAND_LENGTH + 1))
  .transform((value) => [...new Set(value.split(',').map((name) => name.trim()))].sort())
  .pipe(z.array(z.string().min(1).max(MAX_BRAND_LENGTH)).max(MAX_BRANDS))
  .optional()

const insideFrance = (lat: number, lon: number): boolean =>
  lat >= FRANCE_BOUNDS.minLatitude &&
  lat <= FRANCE_BOUNDS.maxLatitude &&
  lon >= FRANCE_BOUNDS.minLongitude &&
  lon <= FRANCE_BOUNDS.maxLongitude

const tripQuerySchema = z
  .object({
    lat: latitudeParam,
    lon: longitudeParam,
    toLat: latitudeParam,
    toLon: longitudeParam,
    fuel: z.enum(FUEL_TYPES),
    sort: z.enum(['price', 'distance']).default('price'),
    corridorKm: z.preprocess(
      (value) => value ?? String(DEFAULT_CORRIDOR_KM),
      numberParam(z.number().positive().max(10)),
    ),
    limit: z.preprocess(
      (value) => value ?? String(DEFAULT_LIMIT),
      numberParam(z.number().int().positive().max(MAX_LIMIT)),
    ),
    brands: brandsParam,
  })
  .refine((q) => insideFrance(q.toLat, q.toLon) && insideFrance(q.lat, q.lon), 'outside coverage')

/**
 * Stations along a driving route to a destination: computes the route (provider chain, budget and
 * rate limit shared with the single-station route), then keeps the stations within a corridor
 * around the path. "Off route" is the straight distance from the station to the path.
 */
export function registerTripRoute(
  app: FastifyInstance,
  deps: {
    repository: StationReader
    routing: RoutingPort | undefined
    rateLimitPerMinute: number
    now: () => Date
  },
): void {
  const { repository, routing, rateLimitPerMinute, now } = deps

  app.get(
    '/trip/stations',
    { config: { rateLimit: { max: rateLimitPerMinute, timeWindow: '1 minute' } } },
    async (request, reply) => {
      const parsed = tripQuerySchema.safeParse(request.query)
      if (!parsed.success) {
        return reply.code(400).send(fail('INVALID_QUERY', 'Invalid trip parameters'))
      }
      const query = parsed.data
      const from = {
        latitude: roundTo(query.lat, COORDINATE_DECIMALS),
        longitude: roundTo(query.lon, COORDINATE_DECIMALS),
      }
      const to = {
        latitude: roundTo(query.toLat, COORDINATE_DECIMALS),
        longitude: roundTo(query.toLon, COORDINATE_DECIMALS),
      }
      const corridor = corridorKm(query.corridorKm)

      try {
        if (!routing) throw new RoutingError('unavailable', 'No routing provider')
        const route = await routing.getRoute(from, to)

        // Candidates: every station in the box around the path, widened by the corridor.
        const box = pathBounds(route.path, corridor)
        const candidates = repository.findInArea({
          latitude: from.latitude,
          longitude: from.longitude,
          radiusKm: 0, // not used when bounds are given
          bounds: box,
          fuel: query.fuel,
          sort: 'distance',
          limit: Number.MAX_SAFE_INTEGER,
          brands: query.brands,
        }).stations

        const onRoute = candidates
          .map((entry) => ({ entry, offRouteKm: distanceToPathKm(entry.station, route.path) }))
          .filter(({ offRouteKm }) => offRouteKm <= corridor)
        onRoute.sort((a, b) =>
          query.sort === 'price'
            ? a.entry.price.price - b.entry.price.price || a.offRouteKm - b.offRouteKm
            : a.offRouteKm - b.offRouteKm || a.entry.price.price - b.entry.price.price,
        )

        const currentTime = now()
        const shown = onRoute.slice(0, query.limit)
        reply.header('Cache-Control', `private, max-age=${TRIP_CACHE_SECONDS}`)
        return ok(
          {
            route,
            stations: shown.map(({ entry, offRouteKm }) => ({
              ...toStationResult(entry, currentTime),
              offRouteKm: roundTo(offRouteKm, 2),
            })),
          },
          {
            count: shown.length,
            total: onRoute.length,
            truncated: onRoute.length > shown.length,
            corridorKm: corridor,
            attribution: attributionFor(route.provider),
          },
        )
      } catch (error) {
        if (!(error instanceof RoutingError)) throw error
        const known = ROUTING_ERRORS[error.kind]
        if (error.kind === 'failed') request.log.error({ err: error }, 'routing failed')
        return reply.code(known.status).send(fail(known.code, known.message))
      }
    },
  )
}
