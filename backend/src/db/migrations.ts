import type { DatabaseSync } from 'node:sqlite'
import { z } from 'zod'

// Schema versions are stored in SQLite's `user_version`. Each step is idempotent, so a database
// created before versioning existed (user_version = 0) is upgraded in place without data loss.

const V1_BASE_SCHEMA = `
CREATE TABLE IF NOT EXISTS stations (
  id INTEGER PRIMARY KEY,
  latitude REAL NOT NULL,
  longitude REAL NOT NULL,
  address TEXT NOT NULL,
  city TEXT NOT NULL,
  postal_code TEXT NOT NULL,
  department_code TEXT NOT NULL,
  open_24h INTEGER NOT NULL,
  services TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_stations_geo ON stations (latitude, longitude);
CREATE TABLE IF NOT EXISTS prices (
  station_id INTEGER NOT NULL REFERENCES stations(id) ON DELETE CASCADE,
  fuel TEXT NOT NULL,
  price REAL NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (station_id, fuel)
);
CREATE TABLE IF NOT EXISTS shortages (
  station_id INTEGER NOT NULL REFERENCES stations(id) ON DELETE CASCADE,
  fuel TEXT NOT NULL,
  type TEXT NOT NULL,
  since TEXT NOT NULL,
  PRIMARY KEY (station_id, fuel)
);
CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
`

// V2: opening hours on stations, and a price history that survives ingestions
// (no foreign key on purpose: ingestion replaces the stations table).
const V2_HISTORY = `
CREATE TABLE IF NOT EXISTS price_history (
  station_id INTEGER NOT NULL,
  fuel TEXT NOT NULL,
  at TEXT NOT NULL,
  price REAL NOT NULL,
  PRIMARY KEY (station_id, fuel, at)
);
`

const tableInfoSchema = z.array(z.object({ name: z.string() }))
const versionSchema = z.object({ user_version: z.number() })

function hasColumn(db: DatabaseSync, table: string, column: string): boolean {
  const columns = tableInfoSchema.parse(db.prepare(`PRAGMA table_info(${table})`).all())
  return columns.some((entry) => entry.name === column)
}

// V3: price alerts. A device is an anonymous random id generated on the phone; its Expo push
// token is optional (alerts also show up in the app without push). No position is ever stored.
const V3_ALERTS = `
CREATE TABLE IF NOT EXISTS devices (
  device_id TEXT PRIMARY KEY,
  push_token TEXT,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS alerts (
  id TEXT PRIMARY KEY,
  device_id TEXT NOT NULL REFERENCES devices(device_id) ON DELETE CASCADE,
  station_id INTEGER NOT NULL,
  fuel TEXT NOT NULL,
  threshold REAL NOT NULL,
  armed INTEGER NOT NULL DEFAULT 1,
  triggered_at TEXT,
  created_at TEXT NOT NULL,
  UNIQUE (device_id, station_id, fuel)
);
CREATE INDEX IF NOT EXISTS idx_alerts_device ON alerts (device_id);
`

// V4: history timestamps stored as UTC ISO ("...Z"). SQLite converts offsets such as "+02:00" to UTC.
// Rows that would collide after conversion are dropped (they describe the same instant).
const V4_NORMALISE_HISTORY = `
UPDATE OR IGNORE price_history
   SET at = strftime('%Y-%m-%dT%H:%M:%fZ', at)
 WHERE at NOT LIKE '%Z' AND strftime('%Y-%m-%dT%H:%M:%fZ', at) IS NOT NULL;
DELETE FROM price_history WHERE at NOT LIKE '%Z';
`

// V5: station brands, joined from OpenStreetMap by official station number. A separate table with
// no foreign key, because ingestion replaces the stations table every few minutes.
const V5_BRANDS = `
CREATE TABLE IF NOT EXISTS station_brands (
  station_id INTEGER PRIMARY KEY,
  brand TEXT NOT NULL,
  raw TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_station_brands_brand ON station_brands (brand);
`

export const SCHEMA_VERSION = 5

export function migrate(db: DatabaseSync): void {
  const { user_version: current } = versionSchema.parse(db.prepare('PRAGMA user_version').get())
  if (current >= SCHEMA_VERSION) return

  db.exec('BEGIN IMMEDIATE')
  try {
    db.exec(V1_BASE_SCHEMA)
    if (!hasColumn(db, 'stations', 'opening_hours')) {
      db.exec("ALTER TABLE stations ADD COLUMN opening_hours TEXT NOT NULL DEFAULT '[]'")
    }
    db.exec(V2_HISTORY)
    db.exec(V3_ALERTS)
    db.exec(V4_NORMALISE_HISTORY)
    db.exec(V5_BRANDS)
    db.exec(`PRAGMA user_version = ${SCHEMA_VERSION}`)
    db.exec('COMMIT')
  } catch (error) {
    try {
      db.exec('ROLLBACK')
    } catch {
      // keep the original error
    }
    throw error
  }
}
