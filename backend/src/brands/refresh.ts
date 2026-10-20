import type { StationRepository } from '../db/stationRepository'
import { fetchOsmBrands, type BrandEntry } from './overpass'

const MIN_BRANDS_TO_REPLACE = 500
// A refresh that loses more than this share of the known brands is a damaged answer, not news.
const MAX_SHRINK_RATIO = 0.5
const MS_PER_DAY = 86_400_000
export const BRANDS_MAX_AGE_DAYS = 7

export interface BrandRefreshResult {
  readonly stored: number
  readonly replaced: boolean
}

type FetchBrands = () => Promise<ReadonlyMap<number, BrandEntry>>

/**
 * Replaces the stored brands with a fresh OpenStreetMap extract. A short or empty answer (timeout,
 * overloaded server, partial result) keeps the previous brands rather than erasing them.
 */
export async function refreshBrands(
  repository: StationRepository,
  now: Date = new Date(),
  fetchBrands: FetchBrands = () => fetchOsmBrands(),
): Promise<BrandRefreshResult> {
  const fresh = await fetchBrands()
  const known = repository.brandCount()
  if (fresh.size < MIN_BRANDS_TO_REPLACE || fresh.size < known * MAX_SHRINK_RATIO) {
    return { stored: known, replaced: false }
  }
  repository.replaceBrands(fresh, now.toISOString())
  return { stored: fresh.size, replaced: true }
}

/** True when brands were never loaded or are older than a week. */
export function brandsNeedRefresh(repository: StationRepository, now: Date = new Date()): boolean {
  const refreshedAt = repository.brandsRefreshedAt()
  if (!refreshedAt) return true
  const age = now.getTime() - new Date(refreshedAt).getTime()
  return !(age >= 0) || age > BRANDS_MAX_AGE_DAYS * MS_PER_DAY
}
