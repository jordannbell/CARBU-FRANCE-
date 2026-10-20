import { z } from 'zod'

// Coordinates are rounded to ~110 m: enough for a 1 km+ radius search, and the server
// never works with the user's exact position (data minimisation, GDPR).
export const COORDINATE_DECIMALS = 3

export type ApiError = { readonly code: string; readonly message: string }

export type Envelope<T> =
  | {
      readonly success: true
      readonly data: T
      readonly error: null
      readonly meta?: Record<string, unknown>
    }
  | { readonly success: false; readonly data: null; readonly error: ApiError }

export const ok = <T>(data: T, meta?: Record<string, unknown>): Envelope<T> =>
  meta ? { success: true, data, error: null, meta } : { success: true, data, error: null }

export const fail = (code: string, message: string): Envelope<never> => ({
  success: false,
  data: null,
  error: { code, message },
})

// Fixed messages for framework-generated 4xx errors, so no internal detail reaches the client.
export const CLIENT_ERRORS: Readonly<Record<number, ApiError>> = {
  413: { code: 'PAYLOAD_TOO_LARGE', message: 'Request body is too large' },
  415: { code: 'UNSUPPORTED_MEDIA_TYPE', message: 'Unsupported media type' },
  429: { code: 'RATE_LIMITED', message: 'Too many requests, retry later' },
}

export const roundTo = (value: number, decimals: number): number => {
  const factor = 10 ** decimals
  return Math.round(value * factor) / factor
}

/** Empty strings must be rejected before coercion, otherwise Number('') === 0. */
export const numberParam = <T extends z.ZodTypeAny>(rules: T) =>
  z.string().min(1).max(32).pipe(z.coerce.number().finite()).pipe(rules)

export const latitudeParam = numberParam(z.number().min(-90).max(90))
export const longitudeParam = numberParam(z.number().min(-180).max(180))

export const stationIdParam = z
  .string()
  .regex(/^\d{1,10}$/)
  .pipe(z.coerce.number().int().positive())
