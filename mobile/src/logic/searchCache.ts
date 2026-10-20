import { z } from 'zod'
import type { AreaParams, MapBounds } from '../api'
import { stationResultSchema, type StationResult } from '../contract'

const MAX_ENTRIES = 8

const entrySchema = z.object({
  key: z.string(),
  savedAt: z.string(),
  stations: z.array(stationResultSchema),
})
const cacheSchema = z.array(entrySchema)
export type CacheEntry = z.infer<typeof entrySchema>

const fixed = (value: number, decimals: number): string => value.toFixed(decimals)
const sortedBrands = (brands: readonly string[] | undefined): string =>
  [...(brands ?? [])].sort().join(',')

export const boundsEdges = (bounds: MapBounds): readonly number[] => [
  bounds.minLatitude,
  bounds.minLongitude,
  bounds.maxLatitude,
  bounds.maxLongitude,
]

/** Exact key of an area search: any difference in what is asked gives another key. */
export function areaKey(params: AreaParams): string {
  return [
    'area',
    fixed(params.latitude, 3),
    fixed(params.longitude, 3),
    params.fuel,
    params.sort,
    params.limit,
    sortedBrands(params.brands),
    ...boundsEdges(params.bounds).map((value) => fixed(value, 4)),
  ].join('|')
}

/** Coarse key (~1 km) for the device cache: a slightly different view reuses the same entry. */
export function areaCacheKey(params: AreaParams): string {
  const { bounds } = params
  return [
    'area',
    fixed((bounds.minLatitude + bounds.maxLatitude) / 2, 2),
    fixed((bounds.minLongitude + bounds.maxLongitude) / 2, 2),
    fixed(bounds.maxLatitude - bounds.minLatitude, 2),
    params.fuel,
    params.sort,
    sortedBrands(params.brands),
  ].join('|')
}

export function parseCache(raw: string | null): readonly CacheEntry[] {
  if (!raw) return []
  try {
    const parsed = cacheSchema.safeParse(JSON.parse(raw))
    return parsed.success ? parsed.data : []
  } catch {
    return []
  }
}

/** Immutable update: the new entry goes first, the oldest ones beyond the cap are dropped. */
export function putEntry(
  entries: readonly CacheEntry[],
  key: string,
  stations: readonly StationResult[],
  savedAt: string,
): readonly CacheEntry[] {
  return [{ key, savedAt, stations: [...stations] }, ...entries.filter((e) => e.key !== key)].slice(
    0,
    MAX_ENTRIES,
  )
}

export const findEntry = (entries: readonly CacheEntry[], key: string): CacheEntry | undefined =>
  entries.find((entry) => entry.key === key)
