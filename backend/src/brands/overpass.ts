import { z } from 'zod'
import { normalizeBrand, type Brand } from './normalize'

// The official price feed has no brand. OpenStreetMap volunteers tag many stations with the
// official station number (ref:FR:prix-carburants) next to their brand, so stations are joined by
// that number, never by position. Data © OpenStreetMap contributors, ODbL.
export const OVERPASS_URL = 'https://overpass-api.de/api/interpreter'
export const OSM_ATTRIBUTION = '© OpenStreetMap contributors (ODbL)'

const QUERY =
  '[out:json][timeout:240];area["ISO3166-1"="FR"]["admin_level"="2"]->.fr;' +
  'nwr["amenity"="fuel"]["ref:FR:prix-carburants"](area.fr);out tags;'

const REQUEST_TIMEOUT_MS = 280_000
const MAX_BODY_BYTES = 64 * 1024 * 1024
const USER_AGENT = 'carbu-france/0.1 (open-source portfolio project; weekly refresh)'
const REF_TAG = 'ref:FR:prix-carburants'
const MAX_STATION_ID = 2_147_483_647

const responseSchema = z.object({
  elements: z.array(z.object({ tags: z.record(z.string()).optional() })).max(200_000),
})

export interface BrandEntry extends Brand {
  /** The text as found on the map, kept for diagnosis. */
  readonly raw: string
}

/** Station numbers listed in the tag (some objects carry several, separated by ; or ,). */
function stationIds(tagValue: string): number[] {
  return tagValue
    .split(/[;,]/)
    .map((part) => part.trim())
    .filter((part) => /^\d{1,10}$/.test(part))
    .map(Number)
    .filter((id) => id > 0 && id <= MAX_STATION_ID)
}

/** brand, then name, then operator: the first one that names a real brand wins. */
function brandOf(tags: Readonly<Record<string, string>>): BrandEntry | null {
  for (const key of ['brand', 'name', 'operator']) {
    const raw = tags[key]
    const brand = normalizeBrand(raw)
    if (brand && raw) return { ...brand, raw }
  }
  return null
}

export function parseOverpass(json: unknown): ReadonlyMap<number, BrandEntry> {
  const parsed = responseSchema.safeParse(json)
  if (!parsed.success) throw new Error('Unexpected Overpass response')

  const result = new Map<number, BrandEntry>()
  for (const element of parsed.data.elements) {
    const tags = element.tags
    const ref = tags?.[REF_TAG]
    if (!tags || !ref) continue
    const entry = brandOf(tags)
    if (!entry) continue
    for (const id of stationIds(ref)) {
      // Two map objects for one station (a node and a building): keep the first named one.
      if (!result.has(id)) result.set(id, entry)
    }
  }
  return result
}

// Public Overpass servers answer 429/502/504 when busy. Fixed hosts, never built from user input.
export const OVERPASS_URLS = [
  OVERPASS_URL,
  'https://overpass.kumi.systems/api/interpreter',
] as const
const ATTEMPTS = 4
const RETRY_DELAY_MS = 10_000

async function requestOnce(fetchImpl: typeof fetch, url: string): Promise<string> {
  const response = await fetchImpl(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
      'User-Agent': USER_AGENT,
    },
    body: new URLSearchParams({ data: QUERY }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    redirect: 'error',
  })
  if (!response.ok) throw new Error(`Overpass request failed: HTTP ${response.status}`)
  if (Number(response.headers.get('content-length') ?? 0) > MAX_BODY_BYTES) {
    throw new Error('Overpass response is larger than the allowed size')
  }
  const text = await response.text()
  if (text.length > MAX_BODY_BYTES) {
    throw new Error('Overpass response is larger than the allowed size')
  }
  return text
}

/** Tries each server in turn, a few rounds, and reports the last failure if none answers. */
export async function fetchOsmBrands(
  fetchImpl: typeof fetch = fetch,
  urls: readonly string[] = OVERPASS_URLS,
  retryDelayMs: number = RETRY_DELAY_MS,
): Promise<ReadonlyMap<number, BrandEntry>> {
  let lastError: unknown
  for (let attempt = 0; attempt < ATTEMPTS; attempt += 1) {
    const url = urls[attempt % urls.length]
    if (!url) break
    try {
      return parseOverpass(JSON.parse(await requestOnce(fetchImpl, url)))
    } catch (error) {
      lastError = error
      if (attempt < ATTEMPTS - 1) await new Promise((resolve) => setTimeout(resolve, retryDelayMs))
    }
  }
  throw lastError instanceof Error ? lastError : new Error('Overpass request failed')
}
