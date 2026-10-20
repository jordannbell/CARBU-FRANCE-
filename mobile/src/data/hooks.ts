import { useEffect, useMemo, useState } from 'react'
import {
  fetchBrands,
  fetchFavoriteStations,
  fetchPriceHistory,
  fetchRoute,
  fetchStationDetail,
  fetchTrip,
  searchArea,
  searchPlaces,
  type ApiErrorKind,
  type AreaPage,
  type AreaParams,
  type TripPage,
  type TripParams,
} from '../api'
import type {
  BrandOption,
  FuelId,
  Place,
  PriceHistory,
  RouteResult,
  StationDetail,
  StationResult,
} from '../contract'
import {
  areaCacheKey,
  areaKey,
  boundsEdges,
  findEntry,
  parseCache,
  putEntry,
} from '../logic/searchCache'
import { STORAGE_KEYS, deviceStore, type KeyValueStore } from '../storage'
import { useRemote } from '../useRemote'

const PLACE_QUERY_MIN_LENGTH = 3
const PLACE_DEBOUNCE_MS = 350
const HISTORY_DAYS = 30

interface Origin {
  readonly latitude: number
  readonly longitude: number
}

export function useStationDetail(stationId: number | null) {
  return useRemote<StationDetail>(
    stationId === null ? null : `detail|${stationId}`,
    (signal, baseUrl) => fetchStationDetail(stationId ?? 0, { signal, baseUrl }),
  )
}

export function useRoute(stationId: number | null, origin: Origin | null) {
  const key =
    stationId === null || origin === null
      ? null
      : `route|${stationId}|${origin.latitude.toFixed(4)}|${origin.longitude.toFixed(4)}`
  return useRemote<RouteResult>(key, (signal, baseUrl) =>
    fetchRoute(stationId ?? 0, origin ?? { latitude: 0, longitude: 0 }, { signal, baseUrl }),
  )
}

export function usePriceHistory(stationId: number | null, fuel: FuelId) {
  return useRemote<PriceHistory>(
    stationId === null ? null : `history|${stationId}|${fuel}`,
    (signal, baseUrl) => fetchPriceHistory(stationId ?? 0, fuel, HISTORY_DAYS, { signal, baseUrl }),
  )
}

export const HISTORY_WINDOW_DAYS = HISTORY_DAYS

/** Route to a destination and the stations along it. Null params = no trip. */
export function useTrip(params: TripParams | null) {
  const key = params
    ? [
        'trip',
        params.from.latitude.toFixed(3),
        params.from.longitude.toFixed(3),
        params.to.latitude.toFixed(3),
        params.to.longitude.toFixed(3),
        params.fuel,
        params.sort,
        params.limit,
        [...(params.brands ?? [])].sort().join(','),
      ].join('|')
    : null
  return useRemote<TripPage>(key, (signal, baseUrl) => {
    if (!params) throw new Error('trip requested without parameters')
    return fetchTrip(params, { signal, baseUrl })
  })
}

/** Favourites by id, wherever the user is. Empty list = nothing to load. */
export function useFavoriteStations(ids: readonly number[], fuel: FuelId, origin: Origin | null) {
  const key =
    ids.length === 0 || origin === null
      ? null
      : `favorites|${ids.join(',')}|${fuel}|${origin.latitude.toFixed(3)}|${origin.longitude.toFixed(3)}`
  return useRemote<readonly StationResult[]>(key, (signal, baseUrl) =>
    fetchFavoriteStations(
      ids,
      { fuel, ...(origin ?? { latitude: 0, longitude: 0 }) },
      { signal, baseUrl },
    ),
  )
}

/** Address suggestions, debounced so typing does not spend the provider quota. */
export function usePlaceSearch(text: string) {
  const trimmed = text.trim().replace(/\s+/g, ' ')
  const [debounced, setDebounced] = useState('')

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(trimmed), PLACE_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [trimmed])

  const query =
    debounced.length >= PLACE_QUERY_MIN_LENGTH && trimmed === debounced ? debounced : null
  const result = useRemote<readonly Place[]>(
    query === null ? null : `places|${query}`,
    (signal, baseUrl) => searchPlaces(query ?? '', { signal, baseUrl }),
  )
  return { ...result, isTooShort: trimmed.length < PLACE_QUERY_MIN_LENGTH }
}

export interface SearchView {
  readonly status: 'idle' | 'loading' | 'done' | 'error'
  readonly stations: readonly StationResult[]
  /** Stations matching in the area, or null when unknown (answer read from the device cache). */
  readonly total: number | null
  readonly truncated: boolean
  /** ISO date when the stations shown come from the device cache instead of the server. */
  readonly cachedAt: string | null
  readonly error: { readonly kind: ApiErrorKind; readonly detail: string } | null
}

/** Brands sold in the part of the map in view, to build the brand filter. */
export function useAreaBrands(params: AreaParams | null) {
  const key = params
    ? `brands|${boundsEdges(params.bounds)
        .map((v) => v.toFixed(4))
        .join('|')}|${params.fuel}`
    : null
  return useRemote<readonly BrandOption[]>(key, (signal, baseUrl) => {
    if (!params) throw new Error('brands requested without parameters')
    return fetchBrands(
      {
        latitude: params.latitude,
        longitude: params.longitude,
        fuel: params.fuel,
        radiusKm: 1,
        bounds: params.bounds,
      },
      { signal, baseUrl },
    )
  })
}

/**
 * Stations in the part of the map in view. The last good answer is kept on the device: it is shown
 * immediately at launch, and stays visible (marked as cached) when the server cannot be reached.
 */
export function useAreaSearch(params: AreaParams | null, store: KeyValueStore = deviceStore) {
  const exactKey = params ? areaKey(params) : null
  const { state, reload } = useRemote<AreaPage>(exactKey, (signal, baseUrl) => {
    if (!params) throw new Error('search requested without parameters')
    return searchArea(params, { signal, baseUrl })
  })

  const key = params ? areaCacheKey(params) : null
  const [cached, setCached] = useState<{
    key: string
    stations: readonly StationResult[]
    savedAt: string
  } | null>(null)

  // Read the cache whenever the search changes.
  useEffect(() => {
    if (key === null) return undefined
    let active = true
    store
      .get(STORAGE_KEYS.searchCache)
      .then((raw) => {
        const entry = findEntry(parseCache(raw), key)
        if (active)
          setCached(entry ? { key, stations: entry.stations, savedAt: entry.savedAt } : null)
      })
      .catch(() => {
        if (active) setCached(null)
      })
    return () => {
      active = false
    }
  }, [key, store])

  // Save every successful answer.
  useEffect(() => {
    if (state.status !== 'done' || key === null) return
    store
      .get(STORAGE_KEYS.searchCache)
      .then((raw) =>
        store.set(
          STORAGE_KEYS.searchCache,
          JSON.stringify(
            putEntry(parseCache(raw), key, state.data.stations, new Date().toISOString()),
          ),
        ),
      )
      .catch(() => undefined) // The cache is an optimisation: failing to save it must not break the screen.
  }, [state, key, store])

  return useMemo(() => {
    const live = state.data
    const fromCache = live === undefined && cached?.key === key ? cached : null
    const view: SearchView = {
      status: state.status,
      stations: live?.stations ?? fromCache?.stations ?? [],
      total: live ? live.total : null,
      truncated: live?.truncated ?? false,
      cachedAt: fromCache ? fromCache.savedAt : null,
      error: state.status === 'error' ? { kind: state.kind, detail: state.detail } : null,
    }
    return { view, reload }
  }, [state, cached, key, reload])
}
