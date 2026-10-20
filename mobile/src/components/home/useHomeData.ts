import { useEffect, useMemo, useRef, useState } from 'react'
import type { ApiErrorKind, AreaParams, TripParams } from '../../api'
import type { FuelId, Place, SortMode, StationResult } from '../../contract'
import { useAreaBrands, useAreaSearch, useFavoriteStations, useTrip } from '../../data/hooks'
import { pickCheapestId } from '../../format'
import { regionAround, regionToArea, type Region } from '../../logic/region'
import { computeSavings } from '../../logic/savings'
import { useAppState } from '../../state/AppState'
import { useUserLocation } from '../../useUserLocation'
import type { MapPoint } from '../StationMap'

const REGION_DEBOUNCE_MS = 350
const INITIAL_RADIUS_KM = 6
const AREA_LIMIT = 60
const TRIP_LIMIT = 60

export type HomeMode = 'area' | 'favorites' | 'trip'

export interface ActiveList {
  readonly status: 'idle' | 'loading' | 'done' | 'error'
  readonly stations: readonly StationResult[]
  /** Stations matching before the list was cut, or null when unknown. */
  readonly total: number | null
  readonly truncated: boolean
  readonly cachedAt: string | null
  readonly error: { readonly kind: ApiErrorKind; readonly detail: string } | null
  readonly reload: () => void
}

/**
 * Everything the map home screen shows, for the three ways of looking: stations in the part of the
 * map in view, favourites, or the stations along a trip. Each answer is tied to the exact
 * question that produced it (see `useRemote`), so a slow answer never shows up for another view.
 */
export function useHomeData({
  fuel,
  sort,
  brands,
  favoritesMode,
  trip,
}: {
  fuel: FuelId
  sort: SortMode
  brands: readonly string[]
  favoritesMode: boolean
  trip: Place | null
}) {
  const { favoriteIds, settings } = useAppState()
  const { state: location, refresh: refreshLocation } = useUserLocation()

  const [initialRegion, setInitialRegion] = useState<Region | null>(null)
  const [region, setRegion] = useState<Region | null>(null)
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null)

  // The map opens on the user, or on Paris when the position is refused (the banner says so).
  useEffect(() => {
    if (initialRegion || location.status === 'loading') return
    const first = regionAround(location.coords, INITIAL_RADIUS_KM)
    setInitialRegion(first)
    setRegion(first)
  }, [location, initialRegion])

  useEffect(
    () => () => {
      if (debounce.current) clearTimeout(debounce.current)
    },
    [],
  )

  /** Called when the map stops moving; the search follows after a short pause. */
  const onRegionChange = (next: Region) => {
    if (debounce.current) clearTimeout(debounce.current)
    debounce.current = setTimeout(() => setRegion(next), REGION_DEBOUNCE_MS)
  }

  const origin = location.status === 'loading' ? null : location.coords
  const area = useMemo(() => (region ? regionToArea(region) : null), [region])

  const areaParams = useMemo<AreaParams | null>(
    () =>
      area && origin
        ? {
            latitude: origin.latitude,
            longitude: origin.longitude,
            fuel,
            sort,
            bounds: area.bounds,
            brands,
            limit: AREA_LIMIT,
          }
        : null,
    [area, origin, fuel, sort, brands],
  )
  const tripParams = useMemo<TripParams | null>(
    () =>
      trip && origin
        ? {
            from: origin,
            to: { latitude: trip.latitude, longitude: trip.longitude },
            fuel,
            sort,
            brands,
            limit: TRIP_LIMIT,
          }
        : null,
    [trip, origin, fuel, sort, brands],
  )

  const areaSearch = useAreaSearch(!favoritesMode && !trip ? areaParams : null)
  const brandOptions = useAreaBrands(areaParams)
  const tripSearch = useTrip(!favoritesMode && trip ? tripParams : null)
  const favorites = useFavoriteStations(favoritesMode ? favoriteIds : [], fuel, origin)

  const mode: HomeMode = favoritesMode ? 'favorites' : trip ? 'trip' : 'area'

  const active: ActiveList = useMemo(() => {
    if (mode === 'favorites') {
      const stations = favorites.state.data ?? []
      return {
        status: favorites.state.status,
        stations,
        total: stations.length,
        truncated: false,
        cachedAt: null,
        error:
          favorites.state.status === 'error'
            ? { kind: favorites.state.kind, detail: favorites.state.detail }
            : null,
        reload: favorites.reload,
      }
    }
    if (mode === 'trip') {
      const page = tripSearch.state.data
      return {
        status: tripSearch.state.status,
        stations: page?.stations ?? [],
        total: page ? page.total : null,
        truncated: page?.truncated ?? false,
        cachedAt: null,
        error:
          tripSearch.state.status === 'error'
            ? { kind: tripSearch.state.kind, detail: tripSearch.state.detail }
            : null,
        reload: tripSearch.reload,
      }
    }
    return { ...areaSearch.view, reload: areaSearch.reload }
  }, [mode, favorites, tripSearch, areaSearch])

  const visible = useMemo(
    () => (settings.hideStalePrices ? active.stations.filter((s) => !s.stale) : active.stations),
    [active.stations, settings.hideStalePrices],
  )
  const cheapestId = useMemo(() => pickCheapestId(visible), [visible])
  const savings = useMemo(
    () => computeSavings(visible, settings.tankLiters),
    [visible, settings.tankLiters],
  )
  const routePath: readonly MapPoint[] | undefined = tripSearch.state.data?.route.path

  return {
    location,
    refreshLocation,
    initialRegion,
    onRegionChange,
    areaClamped: area?.clamped ?? false,
    origin,
    mode,
    active,
    visible,
    hiddenCount: active.stations.length - visible.length,
    cheapestId,
    savings,
    brandOptions: brandOptions.state.data ?? [],
    route: tripSearch.state.data?.route,
    routePath: mode === 'trip' ? routePath : undefined,
  }
}
