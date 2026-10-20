import type { OpeningDay } from '../contract'

export type OpenStatus =
  | { readonly state: 'always' }
  | { readonly state: 'open'; readonly until: string }
  | { readonly state: 'closed'; readonly opensAt: string | null }
  | { readonly state: 'unknown' }

const toMinutes = (time: string): number => {
  const [hours = '0', minutes = '0'] = time.split(':')
  return Number(hours) * 60 + Number(minutes)
}

/** JS getDay(): 0 = Sunday. The feed uses 1 = Monday ... 7 = Sunday. */
export const isoWeekday = (date: Date): number => (date.getDay() === 0 ? 7 : date.getDay())

const previousDay = (day: number): number => (day === 1 ? 7 : day - 1)

/**
 * Whether the station is open at `now` (device local time, i.e. France for French users).
 * A range whose closing time is not after its opening time runs past midnight.
 */
export function openStatus(hours: readonly OpeningDay[], open24h: boolean, now: Date): OpenStatus {
  if (open24h) return { state: 'always' }
  if (hours.length === 0) return { state: 'unknown' }

  const today = isoWeekday(now)
  const minutes = now.getHours() * 60 + now.getMinutes()
  const byDay = new Map(hours.map((entry) => [entry.day, entry]))

  // An overnight range that started yesterday may still be running.
  for (const range of byDay.get(previousDay(today))?.ranges ?? []) {
    if (toMinutes(range.close) <= toMinutes(range.open) && minutes < toMinutes(range.close)) {
      return { state: 'open', until: range.close }
    }
  }
  for (const range of byDay.get(today)?.ranges ?? []) {
    const open = toMinutes(range.open)
    const close = toMinutes(range.close)
    const overnight = close <= open
    if (minutes >= open && (overnight || minutes < close)) {
      return { state: 'open', until: range.close }
    }
  }

  const laterToday = (byDay.get(today)?.ranges ?? [])
    .filter((range) => toMinutes(range.open) > minutes)
    .sort((a, b) => toMinutes(a.open) - toMinutes(b.open))[0]
  return { state: 'closed', opensAt: laterToday ? laterToday.open : null }
}
