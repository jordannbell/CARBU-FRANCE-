import type { StationRepository } from '../db/stationRepository'
import { fetchRawStations } from './fetchStations'
import { parseStationRecords } from './parseRecord'

// Refuse to replace existing data with a feed that lost more than half of its stations.
export const MIN_RETAINED_RATIO = 0.5

export interface IngestResult {
  readonly stored: number
  readonly received: number
  readonly skipped: Readonly<Record<string, number>>
}

export interface IngestDeps {
  readonly fetchRaw?: () => Promise<readonly unknown[]>
  readonly now?: () => Date
}

/** Downloads the official feed and atomically replaces the stored stations (and records history). */
export async function ingestOnce(
  repository: StationRepository,
  options: { force?: boolean } = {},
  deps: IngestDeps = {},
): Promise<IngestResult> {
  const { fetchRaw = () => fetchRawStations(), now = () => new Date() } = deps
  const raw = await fetchRaw()
  const { stations, skipped } = parseStationRecords(raw)

  if (stations.length === 0) {
    throw new Error('No valid station parsed; refusing to replace existing data')
  }
  const existing = repository.count()
  if (!options.force && existing > 0 && stations.length < existing * MIN_RETAINED_RATIO) {
    throw new Error(
      `Feed looks truncated (${stations.length} stations vs ${existing} stored). Use --force to override.`,
    )
  }

  repository.replaceAll(stations, now().toISOString())
  return { stored: stations.length, received: raw.length, skipped }
}
