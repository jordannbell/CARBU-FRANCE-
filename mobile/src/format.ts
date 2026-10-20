import type { StationResult } from './contract'

export const formatPrice = (price: number): string => `${price.toFixed(3).replace('.', ',')} €`

export const formatDistance = (km: number): string =>
  km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1).replace('.', ',')} km`

export function formatUpdatedAt(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return 'date inconnue'
  return date.toLocaleString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/**
 * The "cheapest" badge only goes to a station whose price is recent and not in shortage:
 * a low price nobody can actually use must not be recommended.
 */
export function pickCheapestId(stations: readonly StationResult[]): number | undefined {
  let best: StationResult | undefined
  for (const station of stations) {
    if (station.stale || station.shortage) continue
    if (!best || station.price < best.price) best = station
  }
  return best?.id
}

export function formatDuration(seconds: number): string {
  const minutes = Math.max(1, Math.round(seconds / 60))
  if (minutes < 60) return `${minutes} min`
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`
}

/** Amounts of money (not prices per litre): two decimals, e.g. "4,20 €". */
export const formatEuros = (amount: number): string => `${amount.toFixed(2).replace('.', ',')} €`

export function formatDate(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return 'date inconnue'
  return date.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

/** True when `iso` falls on the same calendar day as `now`, in the phone's time zone. */
export function isSameLocalDay(iso: string, now: Date): boolean {
  const date = new Date(iso)
  return (
    !Number.isNaN(date.getTime()) &&
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()
  )
}
