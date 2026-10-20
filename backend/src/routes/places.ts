import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { GeocodeError, type GeocoderPort, type Place } from '../geocoding/ign'
import { fail, ok } from '../http'
import { TtlCache } from '../ttlCache'

const MIN_QUERY_LENGTH = 3
const MAX_QUERY_LENGTH = 100
const CACHE_TTL_MS = 5 * 60_000
const CACHE_MAX_ENTRIES = 1_000
const CACHE_CONTROL_SECONDS = 300
export const IGN_ATTRIBUTION = 'Adresses : Géoplateforme (IGN)'

const querySchema = z.object({
  q: z
    .string()
    .transform((value) => value.trim().replace(/\s+/g, ' '))
    .pipe(z.string().min(MIN_QUERY_LENGTH).max(MAX_QUERY_LENGTH)),
})

const GEOCODE_ERRORS: Readonly<
  Record<GeocodeError['kind'], { status: number; code: string; message: string }>
> = {
  busy: { status: 503, code: 'GEOCODING_BUSY', message: 'Address search is busy, retry later' },
  failed: { status: 502, code: 'GEOCODING_FAILED', message: 'Address search failed, retry later' },
}

/**
 * Address autocomplete, proxied so that the phone never talks to the provider directly and the
 * query can be rate limited and cached. The text typed by the user is the only thing sent.
 */
export function registerPlacesRoute(
  app: FastifyInstance,
  deps: { geocoder: GeocoderPort | undefined; rateLimitPerMinute: number; now: () => Date },
): void {
  const { geocoder, rateLimitPerMinute, now } = deps
  const cache = new TtlCache<string, readonly Place[]>(CACHE_MAX_ENTRIES, CACHE_TTL_MS, () =>
    now().getTime(),
  )

  app.get(
    '/places',
    { config: { rateLimit: { max: rateLimitPerMinute, timeWindow: '1 minute' } } },
    async (request, reply) => {
      const parsed = querySchema.safeParse(request.query)
      if (!parsed.success) {
        return reply.code(400).send(fail('INVALID_QUERY', 'Type at least 3 characters'))
      }
      if (!geocoder) {
        return reply
          .code(503)
          .send(fail('GEOCODING_UNAVAILABLE', 'Address search is not available'))
      }

      const key = parsed.data.q.toLowerCase()
      try {
        const cached = cache.get(key)
        const places = cached ?? (await geocoder.search(parsed.data.q))
        if (!cached) cache.set(key, places)
        reply.header('Cache-Control', `public, max-age=${CACHE_CONTROL_SECONDS}`)
        return ok(places, { attribution: IGN_ATTRIBUTION })
      } catch (error) {
        if (!(error instanceof GeocodeError)) throw error
        const known = GEOCODE_ERRORS[error.kind]
        if (error.kind === 'failed') request.log.error({ err: error }, 'geocoding failed')
        return reply.code(known.status).send(fail(known.code, known.message))
      }
    },
  )
}
