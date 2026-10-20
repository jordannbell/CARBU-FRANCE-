import { randomUUID } from 'node:crypto'
import type { DatabaseSync } from 'node:sqlite'
import { z } from 'zod'
import { FUEL_TYPES, type FuelType } from '../domain'

export const MAX_ALERTS_PER_DEVICE = 10
// Global ceilings: devices are anonymous and free to create, so the tables need a hard stop.
export const MAX_DEVICES = 20_000
export const MAX_ALERTS_TOTAL = 100_000

const fuelSchema = z.enum(FUEL_TYPES)

const alertRowSchema = z.object({
  id: z.string(),
  station_id: z.number(),
  fuel: fuelSchema,
  threshold: z.number(),
  triggered_at: z.string().nullable(),
  created_at: z.string(),
  address: z.string().nullable(),
  city: z.string().nullable(),
  price: z.number().nullable(),
  updated_at: z.string().nullable(),
})

const dueRowSchema = z.object({
  id: z.string(),
  device_id: z.string(),
  push_token: z.string().nullable(),
  station_id: z.number(),
  fuel: fuelSchema,
  threshold: z.number(),
  armed: z.number(),
  price: z.number().nullable(),
  updated_at: z.string().nullable(),
  shortage_type: z.string().nullable(),
  address: z.string().nullable(),
  city: z.string().nullable(),
})

/** An alert as the owner sees it, with the station's current price when known. */
export interface AlertView {
  readonly id: string
  readonly stationId: number
  readonly fuel: FuelType
  readonly threshold: number
  readonly triggeredAt: string | null
  readonly createdAt: string
  readonly address: string | null
  readonly city: string | null
  readonly currentPrice: number | null
  /** ISO date of the current price, used to flag a stale price. */
  readonly priceUpdatedAt: string | null
}

/** One alert joined with what the evaluator needs to decide. */
export interface DueAlert {
  readonly id: string
  readonly deviceId: string
  readonly pushToken: string | null
  readonly stationId: number
  readonly fuel: FuelType
  readonly threshold: number
  readonly armed: boolean
  readonly price: number | null
  readonly priceUpdatedAt: string | null
  readonly inShortage: boolean
  readonly address: string | null
  readonly city: string | null
}

const ALERT_SELECT = `
SELECT a.id, a.station_id, a.fuel, a.threshold, a.triggered_at, a.created_at,
       s.address, s.city, p.price, p.updated_at
FROM alerts a
LEFT JOIN stations s ON s.id = a.station_id
LEFT JOIN prices p ON p.station_id = a.station_id AND p.fuel = a.fuel`

/** Alerts, owned by anonymous devices. Every query is scoped by device id except `due`. */
export class AlertStore {
  constructor(private readonly db: DatabaseSync) {}

  deviceCount(): number {
    return z
      .object({ n: z.number() })
      .parse(this.db.prepare('SELECT COUNT(*) AS n FROM devices').get()).n
  }

  totalAlerts(): number {
    return z
      .object({ n: z.number() })
      .parse(this.db.prepare('SELECT COUNT(*) AS n FROM alerts').get()).n
  }

  deviceExists(deviceId: string): boolean {
    return (
      this.db.prepare('SELECT 1 AS found FROM devices WHERE device_id = ?').get(deviceId) !==
      undefined
    )
  }

  /** A push token belongs to one device: claiming it detaches it from any other. */
  private releaseToken(pushToken: string, ownerId: string): void {
    this.db
      .prepare('UPDATE devices SET push_token = NULL WHERE push_token = ? AND device_id <> ?')
      .run(pushToken, ownerId)
  }

  ensureDevice(deviceId: string, pushToken: string | null | undefined, nowIso: string): void {
    if (pushToken) this.releaseToken(pushToken, deviceId)
    // A missing token never erases a known one; an explicit null removes it (see setPushToken).
    this.db
      .prepare(
        `INSERT INTO devices (device_id, push_token, updated_at) VALUES (?, ?, ?)
         ON CONFLICT(device_id) DO UPDATE SET
           push_token = COALESCE(excluded.push_token, devices.push_token),
           updated_at = excluded.updated_at`,
      )
      .run(deviceId, pushToken ?? null, nowIso)
  }

  setPushToken(deviceId: string, pushToken: string | null, nowIso: string): void {
    this.ensureDevice(deviceId, null, nowIso)
    if (pushToken) this.releaseToken(pushToken, deviceId)
    this.db
      .prepare('UPDATE devices SET push_token = ?, updated_at = ? WHERE device_id = ?')
      .run(pushToken, nowIso, deviceId)
  }

  count(deviceId: string): number {
    const row = z
      .object({ n: z.number() })
      .parse(this.db.prepare('SELECT COUNT(*) AS n FROM alerts WHERE device_id = ?').get(deviceId))
    return row.n
  }

  exists(deviceId: string, stationId: number, fuel: FuelType): boolean {
    return (
      this.db
        .prepare(
          'SELECT 1 AS found FROM alerts WHERE device_id = ? AND station_id = ? AND fuel = ?',
        )
        .get(deviceId, stationId, fuel) !== undefined
    )
  }

  /** Creates the alert, or moves the threshold of the existing one for the same station and fuel. */
  upsert(
    deviceId: string,
    stationId: number,
    fuel: FuelType,
    threshold: number,
    nowIso: string,
  ): string {
    const id = randomUUID()
    this.db
      .prepare(
        `INSERT INTO alerts (id, device_id, station_id, fuel, threshold, armed, triggered_at, created_at)
         VALUES (?, ?, ?, ?, ?, 1, NULL, ?)
         ON CONFLICT(device_id, station_id, fuel) DO UPDATE SET
           threshold = excluded.threshold, armed = 1, triggered_at = NULL`,
      )
      .run(id, deviceId, stationId, fuel, threshold, nowIso)
    const row = z
      .object({ id: z.string() })
      .parse(
        this.db
          .prepare('SELECT id FROM alerts WHERE device_id = ? AND station_id = ? AND fuel = ?')
          .get(deviceId, stationId, fuel),
      )
    return row.id
  }

  list(deviceId: string): readonly AlertView[] {
    const rows = alertRowSchema
      .array()
      .parse(
        this.db
          .prepare(`${ALERT_SELECT} WHERE a.device_id = ? ORDER BY a.created_at DESC`)
          .all(deviceId),
      )
    return rows.map((row) => ({
      id: row.id,
      stationId: row.station_id,
      fuel: row.fuel,
      threshold: row.threshold,
      triggeredAt: row.triggered_at,
      createdAt: row.created_at,
      address: row.address,
      city: row.city,
      currentPrice: row.price,
      priceUpdatedAt: row.updated_at,
    }))
  }

  delete(deviceId: string, alertId: string): boolean {
    const result = this.db
      .prepare('DELETE FROM alerts WHERE id = ? AND device_id = ?')
      .run(alertId, deviceId)
    return Number(result.changes) > 0
  }

  /** Forgets the device entirely (its alerts go with it). */
  deleteDevice(deviceId: string): void {
    this.db.prepare('DELETE FROM devices WHERE device_id = ?').run(deviceId)
  }

  /** Every alert with the data needed to evaluate it. */
  due(): readonly DueAlert[] {
    const rows = dueRowSchema.array().parse(
      this.db
        .prepare(
          `SELECT a.id, a.device_id, d.push_token, a.station_id, a.fuel, a.threshold, a.armed,
                  p.price, p.updated_at, r.type AS shortage_type, s.address, s.city
           FROM alerts a
           JOIN devices d ON d.device_id = a.device_id
           LEFT JOIN stations s ON s.id = a.station_id
           LEFT JOIN prices p ON p.station_id = a.station_id AND p.fuel = a.fuel
           LEFT JOIN shortages r ON r.station_id = a.station_id AND r.fuel = a.fuel`,
        )
        .all(),
    )
    return rows.map((row) => ({
      id: row.id,
      deviceId: row.device_id,
      pushToken: row.push_token,
      stationId: row.station_id,
      fuel: row.fuel,
      threshold: row.threshold,
      armed: row.armed === 1,
      price: row.price,
      priceUpdatedAt: row.updated_at,
      inShortage: row.shortage_type !== null,
      address: row.address,
      city: row.city,
    }))
  }

  markTriggered(alertId: string, nowIso: string): void {
    this.db
      .prepare('UPDATE alerts SET armed = 0, triggered_at = ? WHERE id = ?')
      .run(nowIso, alertId)
  }

  rearm(alertId: string): void {
    this.db.prepare('UPDATE alerts SET armed = 1 WHERE id = ?').run(alertId)
  }

  /** Marks the device as active, so a device in use is never pruned. */
  touch(deviceId: string, nowIso: string): void {
    this.db.prepare('UPDATE devices SET updated_at = ? WHERE device_id = ?').run(nowIso, deviceId)
  }

  /** Removes devices (and their alerts) that have not been seen since `beforeIso`. Returns how many. */
  deleteInactiveDevices(beforeIso: string): number {
    const result = this.db.prepare('DELETE FROM devices WHERE updated_at < ?').run(beforeIso)
    return Number(result.changes)
  }

  /** Called when the push service says a token is dead: stop sending to it. */
  clearPushToken(pushToken: string): void {
    this.db.prepare('UPDATE devices SET push_token = NULL WHERE push_token = ?').run(pushToken)
  }
}
