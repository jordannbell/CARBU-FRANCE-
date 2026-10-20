// API contract shared (by test) with the backend. No React Native imports here, so the backend
// test-suite can import this file and verify the real API output against it.
import { z } from 'zod'

export const FUEL_IDS = ['gazole', 'sp95', 'e10', 'sp98', 'e85', 'gplc'] as const
export const fuelIdSchema = z.enum(FUEL_IDS)
export type FuelId = z.infer<typeof fuelIdSchema>

export const stationResultSchema = z.object({
  id: z.number().int(),
  /** Brand such as "E.Leclerc" (from OpenStreetMap), null when unknown. */
  brand: z.string().nullable(),
  /** Kind of brand, for the badge colour. Null when the brand is unknown. */
  brandGroup: z.enum(['supermarket', 'oil', 'other']).nullable(),
  address: z.string(),
  city: z.string(),
  postalCode: z.string(),
  latitude: z.number(),
  longitude: z.number(),
  open24h: z.boolean(),
  services: z.array(z.string()),
  fuel: fuelIdSchema,
  price: z.number(),
  updatedAt: z.string(),
  stale: z.boolean(),
  shortage: z.object({ type: z.enum(['temporaire', 'definitive']), since: z.string() }).nullable(),
  distanceKm: z.number(),
})
export type StationResult = z.infer<typeof stationResultSchema>

export const routeResultSchema = z.object({
  distanceMeters: z.number().nonnegative(),
  durationSeconds: z.number().nonnegative(),
  provider: z.enum(['openrouteservice', 'osrm']).optional(),
  path: z.array(z.object({ latitude: z.number(), longitude: z.number() })),
})
export type RouteResult = z.infer<typeof routeResultSchema>

const apiErrorSchema = z.object({ code: z.string(), message: z.string() })

/** Every API answer is `{ success, data, error, meta }`. */
export const envelopeSchema = <T extends z.ZodTypeAny>(data: T) =>
  z.discriminatedUnion('success', [
    z.object({
      success: z.literal(true),
      data,
      error: z.null(),
      meta: z.record(z.unknown()).optional(),
    }),
    z.object({ success: z.literal(false), data: z.null(), error: apiErrorSchema }),
  ])

export const stationListEnvelopeSchema = envelopeSchema(z.array(stationResultSchema))
export const routeEnvelopeSchema = envelopeSchema(routeResultSchema)

export type SortMode = 'price' | 'distance'

export const openingDaySchema = z.object({
  day: z.number().int().min(1).max(7), // 1 = Monday ... 7 = Sunday
  closed: z.boolean(),
  ranges: z.array(z.object({ open: z.string(), close: z.string() })),
})
export type OpeningDay = z.infer<typeof openingDaySchema>

export const stationDetailSchema = z.object({
  id: z.number().int(),
  brand: z.string().nullable(),
  latitude: z.number(),
  longitude: z.number(),
  address: z.string(),
  city: z.string(),
  postalCode: z.string(),
  departmentCode: z.string(),
  open24h: z.boolean(),
  services: z.array(z.string()),
  hours: z.array(openingDaySchema),
  prices: z.array(
    z.object({ fuel: fuelIdSchema, price: z.number(), updatedAt: z.string(), stale: z.boolean() }),
  ),
  shortages: z.array(
    z.object({ fuel: fuelIdSchema, type: z.enum(['temporaire', 'definitive']), since: z.string() }),
  ),
})
export type StationDetail = z.infer<typeof stationDetailSchema>

export const priceHistorySchema = z.object({
  fuel: fuelIdSchema,
  days: z.number().int(),
  /** Date of the first observation we hold for this station and fuel. */
  since: z.string().nullable(),
  points: z.array(z.object({ at: z.string(), price: z.number() })),
})
export type PriceHistory = z.infer<typeof priceHistorySchema>

export const placeSchema = z.object({
  label: z.string(),
  city: z.string(),
  postcode: z.string(),
  latitude: z.number(),
  longitude: z.number(),
})
export type Place = z.infer<typeof placeSchema>

export const tripStationSchema = stationResultSchema.extend({
  /** Straight distance from the station to the driving path, in km. */
  offRouteKm: z.number().nonnegative(),
})
export type TripStation = z.infer<typeof tripStationSchema>

export const tripSchema = z.object({
  route: routeResultSchema,
  stations: z.array(tripStationSchema),
})
export type Trip = z.infer<typeof tripSchema>

export const brandOptionSchema = z.object({
  brand: z.string(),
  group: z.enum(['supermarket', 'oil', 'other']),
  count: z.number().int().positive(),
})
export type BrandOption = z.infer<typeof brandOptionSchema>

export const stationDetailEnvelopeSchema = envelopeSchema(stationDetailSchema)
export const priceHistoryEnvelopeSchema = envelopeSchema(priceHistorySchema)
export const placesEnvelopeSchema = envelopeSchema(z.array(placeSchema))

export const alertSchema = z.object({
  id: z.string(),
  stationId: z.number().int(),
  fuel: fuelIdSchema,
  threshold: z.number(),
  triggeredAt: z.string().nullable(),
  createdAt: z.string(),
  address: z.string().nullable(),
  city: z.string().nullable(),
  currentPrice: z.number().nullable(),
  priceUpdatedAt: z.string().nullable(),
  stale: z.boolean().nullable(),
})
export type AlertView = z.infer<typeof alertSchema>

export const alertsEnvelopeSchema = envelopeSchema(z.array(alertSchema))
