import type { BoundingBox } from './geo'

export const FUEL_TYPES = ['gazole', 'sp95', 'e10', 'sp98', 'e85', 'gplc'] as const
export type FuelType = (typeof FUEL_TYPES)[number]

export type ShortageType = 'temporaire' | 'definitive'

export const STALE_AFTER_HOURS = 72
const MS_PER_HOUR = 3_600_000

export const isFuelType = (value: unknown): value is FuelType =>
  typeof value === 'string' && (FUEL_TYPES as readonly string[]).includes(value)

export const isShortageType = (value: unknown): value is ShortageType =>
  value === 'temporaire' || value === 'definitive'

/** A price is stale when it is older than STALE_AFTER_HOURS or its date is unreadable. */
export function isStale(updatedAt: string, now: Date): boolean {
  const updatedMs = Date.parse(updatedAt)
  if (Number.isNaN(updatedMs)) return true
  return now.getTime() - updatedMs > STALE_AFTER_HOURS * MS_PER_HOUR
}

export interface FuelPrice {
  readonly fuel: FuelType
  readonly price: number
  readonly updatedAt: string
}

export interface Shortage {
  readonly fuel: FuelType
  readonly type: ShortageType
  readonly since: string
}

/** One opening interval, "HH:MM" 24h clock. */
export interface OpeningRange {
  readonly open: string
  readonly close: string
}

/** Opening hours of one weekday. day: 1 = Monday ... 7 = Sunday. */
export interface OpeningDay {
  readonly day: number
  readonly closed: boolean
  readonly ranges: readonly OpeningRange[]
}

export interface Station {
  readonly id: number
  readonly latitude: number
  readonly longitude: number
  readonly address: string
  readonly city: string
  readonly postalCode: string
  readonly departmentCode: string
  readonly open24h: boolean
  readonly services: readonly string[]
  readonly hours: readonly OpeningDay[]
  readonly prices: readonly FuelPrice[]
  readonly shortages: readonly Shortage[]
  /** Added from OpenStreetMap after ingestion; absent in the raw feed. */
  readonly brand?: string | null
}

export type StationSummary = Omit<Station, 'prices' | 'shortages' | 'hours' | 'brand'> & {
  /** Brand such as "E.Leclerc", when known. The official price feed does not carry it. */
  readonly brand: string | null
}

export interface BrandCount {
  readonly brand: string
  readonly group: 'supermarket' | 'oil' | 'other'
  readonly count: number
}

export interface NearbyQuery {
  /** When set, only stations inside this box are returned; `radiusKm` then only has to contain it. */
  readonly bounds?: BoundingBox
  readonly latitude: number
  readonly longitude: number
  readonly radiusKm: number
  readonly fuel: FuelType
  readonly sort: 'price' | 'distance'
  readonly limit: number
  /** Only these brands (exact canonical names). Empty or missing = all. */
  readonly brands?: readonly string[]
}

export interface NearbyStation {
  readonly station: StationSummary
  readonly price: FuelPrice
  readonly shortage: Shortage | null
  readonly distanceKm: number
}

/** One observed price of a station, recorded when it changes. */
export interface PricePoint {
  readonly at: string
  readonly price: number
}

export interface PriceHistory {
  readonly points: readonly PricePoint[]
  /** Date of the first observation we have for this station, or null without any. */
  readonly since: string | null
}

/** Read port used by the HTTP layer; the SQLite repository implements it. */
export interface StationReader {
  count(): number
  lastIngestedAt(): string | null
  findNearby(query: NearbyQuery): readonly NearbyStation[]
  /** Like `findNearby`, with the number of stations that match before `limit` is applied. */
  findInArea(query: NearbyQuery): {
    readonly stations: readonly NearbyStation[]
    readonly total: number
  }
  /** Stations by id with a price for `fuel`, measured from `origin`. Unknown ids are skipped. */
  findByIds(
    ids: readonly number[],
    fuel: FuelType,
    origin: { latitude: number; longitude: number },
  ): readonly NearbyStation[]
  findById(id: number): Station | null
  /** Brands present around a point for a fuel, with how many stations each, most frequent first. */
  brandsNear(query: Omit<NearbyQuery, 'sort' | 'limit' | 'brands'>): readonly BrandCount[]
  priceHistory(stationId: number, fuel: FuelType, sinceIso: string): PriceHistory
}

export type ParseResult<T> =
  { readonly ok: true; readonly value: T } | { readonly ok: false; readonly reason: string }
