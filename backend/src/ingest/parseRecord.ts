import { z } from 'zod'
import {
  FUEL_TYPES,
  type FuelPrice,
  type FuelType,
  type ParseResult,
  type Shortage,
  type Station,
} from '../domain'
import { parseOpeningHours } from './hours'

// Bounds protect the database from absurd or hostile values in the remote feed.
const MAX_TEXT_LENGTH = 200
const MAX_SERVICES = 50
const MAX_HOURS_LENGTH = 4_000
const MAX_PRICE_EUR_PER_LITER = 10
const MAX_STATION_ID = 2_147_483_647

const text = z.string().max(MAX_TEXT_LENGTH)
const isoDate = z
  .string()
  .max(40)
  .refine((value) => !Number.isNaN(Date.parse(value)), 'unreadable date')

const baseRecordSchema = z.object({
  id: z.number().int().positive().max(MAX_STATION_ID),
  adresse: text.nullish(),
  ville: text.nullish(),
  cp: z.string().max(10).nullish(),
  code_departement: z.string().max(5).nullish(),
  geom: z
    .object({ lat: z.number().min(-90).max(90), lon: z.number().min(-180).max(180) })
    .nullish(),
  horaires_automate_24_24: z.string().max(10).nullish(),
  horaires: z.string().max(MAX_HOURS_LENGTH).nullish(),
  services_service: z.array(text).max(MAX_SERVICES).nullish(),
})

const fuelColumnsSchema = z.object({
  price: z.number().positive().max(MAX_PRICE_EUR_PER_LITER).nullish(),
  updatedAt: isoDate.nullish(),
  shortageType: z.string().max(40).nullish(),
  shortageSince: isoDate.nullish(),
})

type FuelColumns = z.infer<typeof fuelColumnsSchema>

function readFuelColumns(record: Record<string, unknown>, fuel: FuelType): FuelColumns | null {
  const columns = fuelColumnsSchema.safeParse({
    price: record[`${fuel}_prix`],
    updatedAt: record[`${fuel}_maj`],
    shortageType: record[`${fuel}_rupture_type`],
    shortageSince: record[`${fuel}_rupture_debut`],
  })
  return columns.success ? columns.data : null
}

function toPrice(fuel: FuelType, columns: FuelColumns): FuelPrice | null {
  if (typeof columns.price !== 'number' || !columns.updatedAt) return null
  return { fuel, price: columns.price, updatedAt: columns.updatedAt }
}

function toShortage(fuel: FuelType, columns: FuelColumns): Shortage | null {
  if (!columns.shortageType || !columns.shortageSince) return null
  const type = columns.shortageType.toLowerCase()
  if (type.startsWith('temp')) return { fuel, type: 'temporaire', since: columns.shortageSince }
  if (type.startsWith('def')) return { fuel, type: 'definitive', since: columns.shortageSince }
  return null
}

export function parseStationRecord(input: unknown): ParseResult<Station> {
  const base = baseRecordSchema.safeParse(input)
  if (!base.success) return { ok: false, reason: 'schema' }
  const record = base.data
  if (!record.geom) return { ok: false, reason: 'missing-geometry' }

  // baseRecordSchema succeeded, so the input is a plain object.
  const raw = input as Record<string, unknown>
  const prices: FuelPrice[] = []
  const shortages: Shortage[] = []
  for (const fuel of FUEL_TYPES) {
    const columns = readFuelColumns(raw, fuel)
    if (!columns) continue
    const price = toPrice(fuel, columns)
    const shortage = toShortage(fuel, columns)
    if (price) prices.push(price)
    if (shortage) shortages.push(shortage)
  }

  return {
    ok: true,
    value: {
      id: record.id,
      latitude: record.geom.lat,
      longitude: record.geom.lon,
      address: record.adresse ?? '',
      city: record.ville ?? '',
      postalCode: record.cp ?? '',
      departmentCode: record.code_departement ?? '',
      open24h: record.horaires_automate_24_24 === 'Oui',
      services: record.services_service ?? [],
      hours: parseOpeningHours(record.horaires),
      prices,
      shortages,
    },
  }
}

export interface ParsedBatch {
  readonly stations: readonly Station[]
  readonly skipped: Readonly<Record<string, number>>
}

/** Parses a feed. Duplicate ids keep the last occurrence and are counted as skipped. */
export function parseStationRecords(records: readonly unknown[]): ParsedBatch {
  const byId = new Map<number, Station>()
  const skipped: Record<string, number> = {}
  const skip = (reason: string) => {
    skipped[reason] = (skipped[reason] ?? 0) + 1
  }

  for (const record of records) {
    const result = parseStationRecord(record)
    if (!result.ok) {
      skip(result.reason)
      continue
    }
    if (byId.has(result.value.id)) skip('duplicate')
    byId.set(result.value.id, result.value)
  }
  return { stations: [...byId.values()], skipped }
}
