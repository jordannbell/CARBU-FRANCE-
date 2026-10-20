import { z } from 'zod'
import type { OpeningDay, OpeningRange } from '../domain'

// The feed ships opening hours as a JSON *string*:
// {"@automate-24-24":"","jour":[{"@id":"1","@nom":"Lundi","@ferme":"","horaire":{"@ouverture":"07.30","@fermeture":"21.00"}}, ...]}
// A closed day has "@ferme":"1" and no "horaire". Normalised here, once, at the feed boundary.

const rangeSchema = z.object({ '@ouverture': z.string().max(10), '@fermeture': z.string().max(10) })

const feedHoursSchema = z.object({
  jour: z
    .array(
      z.object({
        '@id': z.string().max(2),
        '@ferme': z.string().max(2).nullish(),
        horaire: z.union([rangeSchema, z.array(rangeSchema).max(4)]).nullish(),
      }),
    )
    .max(7)
    .optional(),
})

const MIN_DAY = 1
const MAX_DAY = 7

/** "07.30" or "7:30" -> "07:30"; anything else -> null. */
function normaliseTime(raw: string): string | null {
  const match = /^(\d{1,2})[.:](\d{2})$/.exec(raw.trim())
  if (!match) return null
  const hours = Number(match[1])
  const minutes = Number(match[2])
  if (hours > 24 || minutes > 59 || (hours === 24 && minutes > 0)) return null
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
}

function toRanges(
  horaire: z.infer<typeof rangeSchema> | z.infer<typeof rangeSchema>[],
): OpeningRange[] {
  const list = Array.isArray(horaire) ? horaire : [horaire]
  return list.flatMap((entry) => {
    const open = normaliseTime(entry['@ouverture'])
    const close = normaliseTime(entry['@fermeture'])
    return open && close ? [{ open, close }] : []
  })
}

/** Returns the seven weekdays that could be read, sorted Monday to Sunday. Unreadable input gives []. */
export function parseOpeningHours(raw: string | null | undefined): readonly OpeningDay[] {
  if (!raw) return []
  let json: unknown
  try {
    json = JSON.parse(raw)
  } catch {
    return []
  }
  const parsed = feedHoursSchema.safeParse(json)
  if (!parsed.success || !parsed.data.jour) return []

  const byDay = new Map<number, OpeningDay>()
  for (const entry of parsed.data.jour) {
    const day = Number(entry['@id'])
    if (!Number.isInteger(day) || day < MIN_DAY || day > MAX_DAY) continue
    const ranges = entry.horaire ? toRanges(entry.horaire) : []
    byDay.set(day, { day, closed: entry['@ferme'] === '1' || ranges.length === 0, ranges })
  }
  return [...byDay.values()].sort((a, b) => a.day - b.day)
}
