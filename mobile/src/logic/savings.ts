import type { StationResult } from '../contract'

// A saving below this is noise (one cent per litre on a small tank) and is not displayed.
const MIN_DISPLAYED_SAVING_EUR = 0.5

const isUsable = (station: StationResult): boolean => !station.stale && !station.shortage

/**
 * Savings of a full tank compared with the most expensive usable station of the same list.
 * Returns an empty map when there is nothing meaningful to compare (fewer than two usable stations).
 * Stale or out-of-stock stations are neither a reference nor a target: their price is not reliable.
 */
export function computeSavings(
  stations: readonly StationResult[],
  tankLiters: number,
): ReadonlyMap<number, number> {
  const usable = stations.filter(isUsable)
  if (usable.length < 2 || tankLiters <= 0) return new Map()

  const reference = Math.max(...usable.map((station) => station.price))
  const result = new Map<number, number>()
  for (const station of usable) {
    const saving = Math.round((reference - station.price) * tankLiters * 100) / 100
    if (saving >= MIN_DISPLAYED_SAVING_EUR) result.set(station.id, saving)
  }
  return result
}
