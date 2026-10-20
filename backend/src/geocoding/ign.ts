import { z } from 'zod'

// Géoplateforme (IGN) address search: public, no key. Fixed URL, never built from user input.
export const IGN_SEARCH_URL = 'https://data.geopf.fr/geocodage/search'

const REQUEST_TIMEOUT_MS = 5_000
const MAX_RESULTS = 5
const MAX_BODY_BYTES = 512 * 1024
const COORDINATE_DECIMALS = 4

export interface Place {
  readonly label: string
  readonly city: string
  readonly postcode: string
  readonly latitude: number
  readonly longitude: number
}

export type GeocodeFailure = 'busy' | 'failed'

/** Expected failure of the geocoding provider; the HTTP layer maps each kind to a status code. */
export class GeocodeError extends Error {
  constructor(
    readonly kind: GeocodeFailure,
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options)
    this.name = 'GeocodeError'
  }
}

export interface GeocoderPort {
  search(query: string): Promise<readonly Place[]>
}

const responseSchema = z.object({
  features: z
    .array(
      z.object({
        geometry: z.object({
          coordinates: z.tuple([z.number().min(-180).max(180), z.number().min(-90).max(90)]),
        }),
        properties: z.object({
          label: z.string().max(300),
          city: z.string().max(120).optional(),
          postcode: z.string().max(10).optional(),
        }),
      }),
    )
    .max(50),
})

const round = (value: number): number => {
  const factor = 10 ** COORDINATE_DECIMALS
  return Math.round(value * factor) / factor
}

export function createIgnGeocoder(
  fetchImpl: typeof fetch = fetch,
  baseUrl: string = IGN_SEARCH_URL,
): GeocoderPort {
  return {
    async search(query: string): Promise<readonly Place[]> {
      const url = new URL(baseUrl)
      url.searchParams.set('q', query)
      url.searchParams.set('limit', String(MAX_RESULTS))
      url.searchParams.set('autocomplete', '1')

      let response: Response
      try {
        response = await fetchImpl(url, {
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
          redirect: 'error',
          headers: { Accept: 'application/json' },
        })
      } catch (cause) {
        throw new GeocodeError('failed', 'Geocoding provider unreachable', { cause })
      }
      if (response.status === 429) throw new GeocodeError('busy', 'Geocoding quota reached')
      if (!response.ok)
        throw new GeocodeError('failed', `Geocoding provider error (HTTP ${response.status})`)

      if (Number(response.headers.get('content-length') ?? 0) > MAX_BODY_BYTES) {
        throw new GeocodeError('failed', 'Geocoding response too large')
      }
      const text = await response.text()
      if (text.length > MAX_BODY_BYTES)
        throw new GeocodeError('failed', 'Geocoding response too large')
      let json: unknown
      try {
        json = JSON.parse(text)
      } catch (cause) {
        throw new GeocodeError('failed', 'Geocoding response is not JSON', { cause })
      }
      const parsed = responseSchema.safeParse(json)
      if (!parsed.success) throw new GeocodeError('failed', 'Unexpected geocoding response')

      return parsed.data.features.map((feature) => ({
        label: feature.properties.label,
        city: feature.properties.city ?? '',
        postcode: feature.properties.postcode ?? '',
        longitude: round(feature.geometry.coordinates[0]),
        latitude: round(feature.geometry.coordinates[1]),
      }))
    },
  }
}
