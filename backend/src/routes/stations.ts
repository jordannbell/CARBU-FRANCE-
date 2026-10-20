import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { FUEL_TYPES, isStale, type StationReader } from '../domain'
import {
  COORDINATE_DECIMALS,
  fail,
  latitudeParam,
  longitudeParam,
  numberParam,
  ok,
  roundTo,
  stationIdParam,
} from '../http'
import { boxHalfDiagonalKm, snapBoxOutward, type BoundingBox } from '../geo'
import { OSM_ATTRIBUTION } from '../brands/overpass'
import { toStationResult } from '../presenters'
import { TtlCache } from '../ttlCache'

const MAX_RADIUS_KM = 50
// A search covers at least the radius asked, rounded up to one of these. Few distinct values means
// a cache that works and no way to dodge it with arbitrary decimals.
const RADIUS_STEPS_KM = [1, 2, 5, 10, 20, MAX_RADIUS_KM] as const
export const quantizeRadius = (radiusKm: number): number =>
  RADIUS_STEPS_KM.find((step) => step >= radiusKm) ?? MAX_RADIUS_KM
const DEFAULT_RADIUS_KM = 10
const MAX_LIMIT = 100
const DEFAULT_LIMIT = 30
const MAX_IDS = 50
const MAX_BRANDS = 10
const MAX_BRAND_LENGTH = 40
const MAX_HISTORY_DAYS = 365
const DEFAULT_HISTORY_DAYS = 30
const CACHE_TTL_MS = 60_000
const CACHE_MAX_ENTRIES = 2_000
const SEARCH_CACHE_SECONDS = 60
const HISTORY_CACHE_SECONDS = 300
const MS_PER_DAY = 86_400_000

// "brands=E.Leclerc,Carrefour": canonical names as returned by /brands. Order does not matter.
const brandsParam = z
  .string()
  .max(MAX_BRANDS * (MAX_BRAND_LENGTH + 1))
  .transform((value) => [...new Set(value.split(',').map((name) => name.trim()))].sort())
  .pipe(z.array(z.string().min(1).max(MAX_BRAND_LENGTH)).max(MAX_BRANDS))
  .optional()

// "bbox=minLat,minLon,maxLat,maxLon": the part of the map in view. Must be a real box that fits in
// the largest search (same 50 km limit as a radius search).
const bboxParam = z
  .string()
  .max(120)
  .transform((value): number[] => value.split(',').map((part) => Number(part.trim())))
  .pipe(z.array(z.number().finite()).length(4))
  .transform(([minLatitude, minLongitude, maxLatitude, maxLongitude]): BoundingBox => ({
    minLatitude: minLatitude ?? NaN,
    minLongitude: minLongitude ?? NaN,
    maxLatitude: maxLatitude ?? NaN,
    maxLongitude: maxLongitude ?? NaN,
  }))
  .refine(
    (box) =>
      box.minLatitude >= -90 &&
      box.maxLatitude <= 90 &&
      box.minLongitude >= -180 &&
      box.maxLongitude <= 180 &&
      box.minLatitude < box.maxLatitude &&
      box.minLongitude < box.maxLongitude,
    'invalid box',
  )
  .refine((box) => boxHalfDiagonalKm(box) <= MAX_RADIUS_KM, 'box too large')
  .optional()

const brandsQuerySchema = z.object({
  bbox: bboxParam,
  lat: latitudeParam,
  lon: longitudeParam,
  fuel: z.enum(FUEL_TYPES),
  radiusKm: z.preprocess(
    (value) => value ?? String(DEFAULT_RADIUS_KM),
    numberParam(z.number().positive().max(MAX_RADIUS_KM)),
  ),
})

const nearbyQuerySchema = z.object({
  lat: latitudeParam,
  lon: longitudeParam,
  fuel: z.enum(FUEL_TYPES),
  radiusKm: z.preprocess(
    (value) => value ?? String(DEFAULT_RADIUS_KM),
    numberParam(z.number().positive().max(MAX_RADIUS_KM)),
  ),
  sort: z.enum(['price', 'distance']).default('price'),
  bbox: bboxParam,
  limit: z.preprocess(
    (value) => value ?? String(DEFAULT_LIMIT),
    numberParam(z.number().int().positive().max(MAX_LIMIT)),
  ),
  brands: brandsParam,
})

const byIdsQuerySchema = z.object({
  ids: z
    .string()
    .min(1)
    .max(MAX_IDS * 11)
    .transform((value) => value.split(','))
    .pipe(
      z
        .array(z.string().regex(/^\d{1,10}$/))
        .min(1)
        .max(MAX_IDS),
    )
    .transform((values) => [...new Set(values.map(Number))]),
  fuel: z.enum(FUEL_TYPES),
  lat: latitudeParam,
  lon: longitudeParam,
})

const historyQuerySchema = z.object({
  fuel: z.enum(FUEL_TYPES),
  days: z.preprocess(
    (value) => value ?? String(DEFAULT_HISTORY_DAYS),
    numberParam(z.number().int().positive().max(MAX_HISTORY_DAYS)),
  ),
})

const idParamsSchema = z.object({ id: stationIdParam })

export function registerStationRoutes(
  app: FastifyInstance,
  deps: { repository: StationReader; now: () => Date },
): void {
  const { repository, now } = deps
  const nearbyCache = new TtlCache<string, unknown>(CACHE_MAX_ENTRIES, CACHE_TTL_MS, () =>
    now().getTime(),
  )

  app.get('/stations', async (request, reply) => {
    const parsed = nearbyQuerySchema.safeParse(request.query)
    if (!parsed.success) {
      return reply.code(400).send(fail('INVALID_QUERY', 'Invalid search parameters'))
    }
    const bounds = parsed.data.bbox ? snapBoxOutward(parsed.data.bbox) : undefined
    const query = {
      ...parsed.data,
      radiusKm: bounds ? boxHalfDiagonalKm(bounds) : quantizeRadius(parsed.data.radiusKm),
    }
    const latitude = roundTo(query.lat, COORDINATE_DECIMALS)
    const longitude = roundTo(query.lon, COORDINATE_DECIMALS)
    const cacheKey = [
      latitude,
      longitude,
      query.fuel,
      query.radiusKm,
      query.sort,
      query.limit,
      (query.brands ?? []).join(','),
      bounds ? Object.values(bounds).join(',') : '',
    ].join('|')

    reply.header('Cache-Control', `public, max-age=${SEARCH_CACHE_SECONDS}`)
    const cached = nearbyCache.get(cacheKey)
    if (cached) return cached

    const currentTime = now()
    const { stations, total } = repository.findInArea({
      latitude,
      longitude,
      radiusKm: query.radiusKm,
      bounds,
      fuel: query.fuel,
      sort: query.sort,
      limit: query.limit,
      brands: query.brands,
    })
    const body = ok(
      stations.map((entry) => toStationResult(entry, currentTime)),
      {
        count: stations.length,
        total,
        truncated: total > stations.length,
        lastIngestedAt: repository.lastIngestedAt(),
      },
    )
    nearbyCache.set(cacheKey, body)
    return body
  })

  // Brands present around a point, to build the filter chips. Same radius steps as a search.
  app.get('/brands', (request, reply) => {
    const parsed = brandsQuerySchema.safeParse(request.query)
    if (!parsed.success) {
      return reply.code(400).send(fail('INVALID_QUERY', 'Invalid search parameters'))
    }
    const query = parsed.data
    const bounds = query.bbox ? snapBoxOutward(query.bbox) : undefined
    const brands = repository.brandsNear({
      latitude: roundTo(query.lat, COORDINATE_DECIMALS),
      longitude: roundTo(query.lon, COORDINATE_DECIMALS),
      radiusKm: bounds ? boxHalfDiagonalKm(bounds) : quantizeRadius(query.radiusKm),
      bounds,
      fuel: query.fuel,
    })
    reply.header('Cache-Control', `public, max-age=${SEARCH_CACHE_SECONDS}`)
    return ok(brands, { count: brands.length, attribution: OSM_ATTRIBUTION })
  })

  // Favourites: the same result shape as a search, for stations chosen by id and wherever they are.
  app.get('/stations/by-ids', (request, reply) => {
    const parsed = byIdsQuerySchema.safeParse(request.query)
    if (!parsed.success) {
      return reply.code(400).send(fail('INVALID_QUERY', 'Invalid favourites parameters'))
    }
    const { ids, fuel, lat, lon } = parsed.data
    const origin = {
      latitude: roundTo(lat, COORDINATE_DECIMALS),
      longitude: roundTo(lon, COORDINATE_DECIMALS),
    }
    const currentTime = now()
    const results = repository.findByIds(ids, fuel, origin)
    reply.header('Cache-Control', 'private, no-store')
    return ok(
      results.map((entry) => toStationResult(entry, currentTime)),
      { count: results.length, requested: ids.length, lastIngestedAt: repository.lastIngestedAt() },
    )
  })

  app.get('/stations/:id', (request, reply) => {
    const parsed = idParamsSchema.safeParse(request.params)
    if (!parsed.success) {
      return reply.code(400).send(fail('INVALID_ID', 'Station id must be a positive integer'))
    }
    const station = repository.findById(parsed.data.id)
    if (!station) return reply.code(404).send(fail('NOT_FOUND', 'Station not found'))

    const currentTime = now()
    return ok({
      ...station,
      prices: station.prices.map((p) => ({ ...p, stale: isStale(p.updatedAt, currentTime) })),
    })
  })

  app.get('/stations/:id/history', (request, reply) => {
    const params = idParamsSchema.safeParse(request.params)
    const query = historyQuerySchema.safeParse(request.query)
    if (!params.success || !query.success) {
      return reply.code(400).send(fail('INVALID_QUERY', 'Invalid history parameters'))
    }
    const { id } = params.data
    const { fuel, days } = query.data
    if (!repository.findById(id))
      return reply.code(404).send(fail('NOT_FOUND', 'Station not found'))

    const since = new Date(now().getTime() - days * MS_PER_DAY).toISOString()
    const history = repository.priceHistory(id, fuel, since)
    reply.header('Cache-Control', `public, max-age=${HISTORY_CACHE_SECONDS}`)
    return ok({ fuel, days, since: history.since, points: history.points })
  })
}
