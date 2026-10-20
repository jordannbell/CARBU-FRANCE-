import { DatabaseSync, type StatementSync } from 'node:sqlite'
import { z } from 'zod'
import {
  FUEL_TYPES,
  type BrandCount,
  type FuelType,
  type NearbyQuery,
  type NearbyStation,
  type OpeningDay,
  type PriceHistory,
  type Station,
  type StationReader,
  type StationSummary,
} from '../domain'
import { groupOf } from '../brands/normalize'
import { boundingBox, boxContains, haversineKm } from '../geo'
import { AlertStore } from '../alerts/store'
import { migrate } from './migrations'

const BUSY_TIMEOUT_MS = 5_000
const MS_PER_DAY = 86_400_000
// Price history older than this is pruned at each ingestion.
export const HISTORY_RETENTION_DAYS = 400
export const MAX_IDS_PER_LOOKUP = 50

/** The feed mixes offsets ("+00:00", "+02:00"); history is stored as UTC ISO so ordering is right. */
const toUtcIso = (value: string): string => {
  const ms = Date.parse(value)
  return Number.isNaN(ms) ? value : new Date(ms).toISOString()
}

const fuelSchema = z.enum(FUEL_TYPES)
const shortageTypeSchema = z.enum(['temporaire', 'definitive'])

const stationRowSchema = z.object({
  id: z.number(),
  latitude: z.number(),
  longitude: z.number(),
  address: z.string(),
  city: z.string(),
  postal_code: z.string(),
  department_code: z.string(),
  open_24h: z.number(),
  services: z.string(),
  opening_hours: z.string(),
  brand: z.string().nullable(),
})

const nearbyRowSchema = stationRowSchema.extend({
  price: z.number(),
  updated_at: z.string(),
  shortage_type: shortageTypeSchema.nullable(),
  shortage_since: z.string().nullable(),
})

const priceRowSchema = z.object({ fuel: fuelSchema, price: z.number(), updated_at: z.string() })
const shortageRowSchema = z.object({
  fuel: fuelSchema,
  type: shortageTypeSchema,
  since: z.string(),
})
const historyRowSchema = z.object({ at: z.string(), price: z.number() })

const servicesSchema = z.array(z.string())
const hoursSchema = z.array(
  z.object({
    day: z.number().int().min(1).max(7),
    closed: z.boolean(),
    ranges: z.array(z.object({ open: z.string(), close: z.string() })),
  }),
)

type StationRow = z.infer<typeof stationRowSchema>
type NearbyRow = z.infer<typeof nearbyRowSchema>

function parseJson<T>(json: string, schema: z.ZodType<T>, fallback: T): T {
  try {
    const parsed = schema.safeParse(JSON.parse(json))
    return parsed.success ? parsed.data : fallback
  } catch {
    return fallback
  }
}

const toSummary = (row: StationRow): StationSummary => ({
  id: row.id,
  latitude: row.latitude,
  longitude: row.longitude,
  address: row.address,
  city: row.city,
  postalCode: row.postal_code,
  departmentCode: row.department_code,
  open24h: row.open_24h === 1,
  services: parseJson(row.services, servicesSchema, []),
  brand: row.brand,
})

const toNearby = (row: NearbyRow, fuel: FuelType, distanceKm: number): NearbyStation => ({
  station: toSummary(row),
  price: { fuel, price: row.price, updatedAt: row.updated_at },
  shortage:
    row.shortage_type && row.shortage_since
      ? { fuel, type: row.shortage_type, since: row.shortage_since }
      : null,
  distanceKm,
})

const NEARBY_SELECT = `
SELECT s.*, b.brand AS brand, p.price AS price, p.updated_at AS updated_at,
       r.type AS shortage_type, r.since AS shortage_since
FROM stations s
JOIN prices p ON p.station_id = s.id AND p.fuel = ?
LEFT JOIN shortages r ON r.station_id = s.id AND r.fuel = p.fuel
LEFT JOIN station_brands b ON b.station_id = s.id`

const NEARBY_SQL = `${NEARBY_SELECT}
WHERE s.latitude BETWEEN ? AND ? AND s.longitude BETWEEN ? AND ?
  AND (r.type IS NULL OR r.type <> 'definitive')`

export class StationRepository implements StationReader {
  private readonly db: DatabaseSync
  /** Price alerts live in the same database as the stations. */
  readonly alerts: AlertStore
  private readonly nearbyStmt: StatementSync
  private readonly byIdStmt: StatementSync
  private readonly pricesStmt: StatementSync
  private readonly shortagesStmt: StatementSync
  private readonly countStmt: StatementSync
  private readonly metaStmt: StatementSync
  private readonly historyStmt: StatementSync
  private readonly historyBeforeStmt: StatementSync
  private readonly historyFirstStmt: StatementSync

  constructor(path: string) {
    this.db = new DatabaseSync(path)
    this.db.exec(`PRAGMA busy_timeout = ${BUSY_TIMEOUT_MS};`)
    this.db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;')
    migrate(this.db)
    this.alerts = new AlertStore(this.db)
    this.nearbyStmt = this.db.prepare(NEARBY_SQL)
    this.byIdStmt = this.db.prepare(
      `SELECT s.*, b.brand AS brand FROM stations s
       LEFT JOIN station_brands b ON b.station_id = s.id WHERE s.id = ?`,
    )
    this.pricesStmt = this.db.prepare(
      'SELECT fuel, price, updated_at FROM prices WHERE station_id = ? ORDER BY fuel',
    )
    this.shortagesStmt = this.db.prepare(
      'SELECT fuel, type, since FROM shortages WHERE station_id = ? ORDER BY fuel',
    )
    this.countStmt = this.db.prepare('SELECT COUNT(*) AS n FROM stations')
    this.metaStmt = this.db.prepare('SELECT value FROM meta WHERE key = ?')
    this.historyStmt = this.db.prepare(
      'SELECT at, price FROM price_history WHERE station_id = ? AND fuel = ? AND at >= ? ORDER BY at',
    )
    this.historyBeforeStmt = this.db.prepare(
      'SELECT at, price FROM price_history WHERE station_id = ? AND fuel = ? AND at < ? ORDER BY at DESC LIMIT 1',
    )
    this.historyFirstStmt = this.db.prepare(
      'SELECT MIN(at) AS first FROM price_history WHERE station_id = ? AND fuel = ?',
    )
  }

  close(): void {
    this.db.close()
  }

  replaceAll(stations: readonly Station[], ingestedAt: string): void {
    const insertStation = this.db.prepare(
      `INSERT INTO stations (id, latitude, longitude, address, city, postal_code, department_code,
         open_24h, services, opening_hours) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    const insertPrice = this.db.prepare('INSERT INTO prices VALUES (?, ?, ?, ?)')
    const insertShortage = this.db.prepare('INSERT INTO shortages VALUES (?, ?, ?, ?)')
    const upsertMeta = this.db.prepare('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)')
    const lastPrice = this.db.prepare(
      'SELECT price FROM price_history WHERE station_id = ? AND fuel = ? ORDER BY at DESC LIMIT 1',
    )
    const insertHistory = this.db.prepare(
      `INSERT INTO price_history (station_id, fuel, at, price) VALUES (?, ?, ?, ?)
       ON CONFLICT(station_id, fuel, at) DO UPDATE SET price = excluded.price`,
    )
    // The newest point of each series is kept even when old: a price that has not changed for a
    // long time is still the current price and the chart's starting point.
    const pruneHistory = this.db.prepare(
      `DELETE FROM price_history WHERE at < ? AND EXISTS (
         SELECT 1 FROM price_history newer
         WHERE newer.station_id = price_history.station_id
           AND newer.fuel = price_history.fuel AND newer.at > price_history.at)`,
    )
    const cutoff = new Date(Date.parse(ingestedAt) - HISTORY_RETENTION_DAYS * MS_PER_DAY)

    this.db.exec('BEGIN IMMEDIATE')
    try {
      this.db.exec('DELETE FROM shortages; DELETE FROM prices; DELETE FROM stations;')
      for (const s of stations) {
        insertStation.run(
          s.id,
          s.latitude,
          s.longitude,
          s.address,
          s.city,
          s.postalCode,
          s.departmentCode,
          s.open24h ? 1 : 0,
          JSON.stringify(s.services),
          JSON.stringify(s.hours),
        )
        for (const p of s.prices) {
          insertPrice.run(s.id, p.fuel, p.price, p.updatedAt)
          // History keeps one point per price *change*, so identical re-ingestions add nothing.
          const previous = lastPrice.get(s.id, p.fuel)
          const previousPrice = historyRowSchema.pick({ price: true }).safeParse(previous)
          if (!previousPrice.success || previousPrice.data.price !== p.price) {
            insertHistory.run(s.id, p.fuel, toUtcIso(p.updatedAt), p.price)
          }
        }
        for (const r of s.shortages) insertShortage.run(s.id, r.fuel, r.type, r.since)
      }
      if (!Number.isNaN(cutoff.getTime())) pruneHistory.run(cutoff.toISOString())
      upsertMeta.run('last_ingested_at', ingestedAt)
      this.db.exec('COMMIT')
    } catch (error) {
      this.rollbackQuietly()
      throw error
    }
  }

  count(): number {
    return z.object({ n: z.number() }).parse(this.countStmt.get()).n
  }

  lastIngestedAt(): string | null {
    const row = z
      .object({ value: z.string() })
      .optional()
      .parse(this.metaStmt.get('last_ingested_at'))
    return row?.value ?? null
  }

  findNearby(query: NearbyQuery): readonly NearbyStation[] {
    return this.findInArea(query).stations
  }

  findInArea(query: NearbyQuery): { stations: readonly NearbyStation[]; total: number } {
    const center = { latitude: query.latitude, longitude: query.longitude }
    const box = query.bounds ?? boundingBox(center, query.radiusKm)
    const rows = nearbyRowSchema
      .array()
      .parse(
        this.nearbyStmt.all(
          query.fuel,
          box.minLatitude,
          box.maxLatitude,
          box.minLongitude,
          box.maxLongitude,
        ),
      )

    const wanted = new Set(query.brands ?? [])
    const ranked = rows
      .map((row) => ({ row, distanceKm: haversineKm(center, row) }))
      .filter((entry) =>
        query.bounds ? boxContains(query.bounds, entry.row) : entry.distanceKm <= query.radiusKm,
      )
      .filter(
        (entry) => wanted.size === 0 || (entry.row.brand !== null && wanted.has(entry.row.brand)),
      )

    const byPrice = (a: (typeof ranked)[number], b: (typeof ranked)[number]) =>
      a.row.price - b.row.price || a.distanceKm - b.distanceKm
    const byDistance = (a: (typeof ranked)[number], b: (typeof ranked)[number]) =>
      a.distanceKm - b.distanceKm || a.row.price - b.row.price

    const stations = [...ranked]
      .sort(query.sort === 'price' ? byPrice : byDistance)
      .slice(0, query.limit)
      .map(({ row, distanceKm }) => toNearby(row, query.fuel, distanceKm))
    return { stations, total: ranked.length }
  }

  findByIds(
    ids: readonly number[],
    fuel: FuelType,
    origin: { latitude: number; longitude: number },
  ): readonly NearbyStation[] {
    const unique = [...new Set(ids.filter((id) => Number.isInteger(id) && id > 0))].slice(
      0,
      MAX_IDS_PER_LOOKUP,
    )
    if (unique.length === 0) return []

    // Only placeholders are interpolated; every id is bound as a parameter.
    const placeholders = unique.map(() => '?').join(', ')
    const rows = nearbyRowSchema
      .array()
      .parse(
        this.db.prepare(`${NEARBY_SELECT} WHERE s.id IN (${placeholders})`).all(fuel, ...unique),
      )

    return rows
      .map((row) => toNearby(row, fuel, haversineKm(origin, row)))
      .sort((a, b) => a.price.price - b.price.price || a.distanceKm - b.distanceKm)
  }

  brandsNear(query: Omit<NearbyQuery, 'sort' | 'limit' | 'brands'>): readonly BrandCount[] {
    const stations = this.findNearby({ ...query, sort: 'distance', limit: Number.MAX_SAFE_INTEGER })
    const counts = new Map<string, number>()
    for (const { station } of stations) {
      if (station.brand) counts.set(station.brand, (counts.get(station.brand) ?? 0) + 1)
    }
    return [...counts.entries()]
      .map(([brand, count]) => ({ brand, group: groupOf(brand), count }))
      .sort((a, b) => b.count - a.count || a.brand.localeCompare(b.brand, 'fr'))
  }

  /** Replaces every known brand in one transaction. */
  replaceBrands(entries: ReadonlyMap<number, { name: string; raw: string }>, nowIso: string): void {
    const insert = this.db.prepare(
      'INSERT INTO station_brands (station_id, brand, raw, updated_at) VALUES (?, ?, ?, ?)',
    )
    const upsertMeta = this.db.prepare('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)')
    this.db.exec('BEGIN IMMEDIATE')
    try {
      this.db.exec('DELETE FROM station_brands')
      for (const [stationId, entry] of entries) insert.run(stationId, entry.name, entry.raw, nowIso)
      upsertMeta.run('brands_refreshed_at', nowIso)
      this.db.exec('COMMIT')
    } catch (error) {
      this.rollbackQuietly()
      throw error
    }
  }

  brandCount(): number {
    return z
      .object({ n: z.number() })
      .parse(this.db.prepare('SELECT COUNT(*) AS n FROM station_brands').get()).n
  }

  brandsRefreshedAt(): string | null {
    const row = z
      .object({ value: z.string() })
      .optional()
      .parse(this.metaStmt.get('brands_refreshed_at'))
    return row?.value ?? null
  }

  findById(id: number): Station | null {
    const raw = this.byIdStmt.get(id)
    if (!raw) return null
    const row = stationRowSchema.parse(raw)
    const prices = priceRowSchema.array().parse(this.pricesStmt.all(id))
    const shortages = shortageRowSchema.array().parse(this.shortagesStmt.all(id))
    const hours: readonly OpeningDay[] = parseJson(row.opening_hours, hoursSchema, [])

    return {
      ...toSummary(row),
      hours,
      prices: prices.map((p) => ({ fuel: p.fuel, price: p.price, updatedAt: p.updated_at })),
      shortages,
    }
  }

  priceHistory(stationId: number, fuel: FuelType, sinceIso: string): PriceHistory {
    const inRange = historyRowSchema.array().parse(this.historyStmt.all(stationId, fuel, sinceIso))
    // The price in force at the start of the window is the last change before it.
    const before = historyRowSchema
      .optional()
      .parse(this.historyBeforeStmt.get(stationId, fuel, sinceIso))
    const first = z
      .object({ first: z.string().nullable() })
      .parse(this.historyFirstStmt.get(stationId, fuel)).first
    const points = [...(before ? [before] : []), ...inRange]
    return { points, since: first }
  }

  private rollbackQuietly(): void {
    try {
      this.db.exec('ROLLBACK')
    } catch {
      // The original error is more useful than a failed rollback.
    }
  }
}
