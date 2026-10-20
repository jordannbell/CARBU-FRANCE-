import type BottomSheet from '@gorhom/bottom-sheet'
import { StatusBar } from 'expo-status-bar'
import { useEffect, useMemo, useRef, useState } from 'react'
import { AccessibilityInfo, Linking, StyleSheet, View } from 'react-native'
import type { MapType } from 'react-native-maps'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import type { ApiErrorKind } from './api'
import { EmptyState } from './components/EmptyState'
import { LocatingScreen } from './components/home/LocatingScreen'
import { RouteModal } from './components/home/RouteModal'
import { SideControls, TopControls } from './components/home/FloatingControls'
import { StationSheet } from './components/home/StationSheet'
import { useHomeData, type ActiveList, type HomeMode } from './components/home/useHomeData'
import { SettingsModal } from './components/SettingsModal'
import { StationSkeleton } from './components/Skeleton'
import { StationDetail } from './components/StationDetail'
import { StationMap, type StationMapHandle } from './components/StationMap'
import { AppText, Banner } from './components/ui'
import type { FuelId, Place, SortMode, StationResult } from './contract'
import { formatDistance, formatDuration, formatUpdatedAt } from './format'
import { fr, fuelLabels } from './i18n/fr'
import { home } from './i18n/home'
import { regionAround } from './logic/region'
import { useAlerts } from './state/Alerts'
import { useAppState } from './state/AppState'
import { useColors } from './theme/ThemeProvider'
import { MIN_TOUCH_TARGET, spacing } from './theme/tokens'

const COLLAPSED_SHEET_HEIGHT = 190
const LOCATE_RADIUS_KM = 4
const AROUND_RADIUS_KM = 5

const errorBody = (kind: ApiErrorKind): string =>
  ({
    network: fr.offlineBody,
    timeout: fr.timeoutBody,
    'rate-limited': fr.rateLimitedBody,
    server: fr.serverBody,
    invalid: fr.serverBody,
    unavailable: fr.serverBody,
    'no-route': home.routeNoRoute,
    'too-far': home.routeTooFar,
    'not-found': fr.serverBody,
    'too-many': fr.serverBody,
  })[kind]

function summaryFor(mode: HomeMode, active: ActiveList, shown: number, clamped: boolean) {
  if (mode === 'favorites') return home.favoritesCount(shown)
  if (active.status === 'loading' && shown === 0) {
    return mode === 'trip' ? home.routeLoading : home.areaLoading
  }
  if (mode === 'trip') return home.routeCorridor(active.total ?? shown)
  if (clamped) return home.areaTooWide
  if (active.total === null) return home.areaCount(shown)
  return active.truncated ? home.areaCountMore(shown, active.total) : home.areaCount(active.total)
}

export function HomeScreen() {
  const colors = useColors()
  const insets = useSafeAreaInsets()
  const { favoriteIds, isFavorite, settings, loaded, loadFailed, saveFailed } = useAppState()
  const { triggered } = useAlerts()

  const [fuel, setFuel] = useState<FuelId>('gazole')
  const [sort, setSort] = useState<SortMode>('price')
  const [brands, setBrands] = useState<readonly string[]>([])
  const [mapType, setMapType] = useState<MapType>('standard')
  const [favoritesMode, setFavoritesMode] = useState(false)
  const [trip, setTrip] = useState<Place | null>(null)
  const [routeModal, setRouteModal] = useState(false)
  const [settingsVisible, setSettingsVisible] = useState(false)
  const [selected, setSelected] = useState<StationResult | null>(null)
  const [expanded, setExpanded] = useState(false)
  const [locatePending, setLocatePending] = useState(false)

  const mapRef = useRef<StationMapHandle>(null)
  const sheetRef = useRef<BottomSheet>(null)

  const data = useHomeData({ fuel, sort, brands, favoritesMode, trip })
  const { active, visible, mode, location, origin } = data
  const collapsedHeight = COLLAPSED_SHEET_HEIGHT + insets.bottom

  // "My position": refresh the GPS, then move the map there once it answers.
  useEffect(() => {
    if (!locatePending || location.status === 'loading') return
    setLocatePending(false)
    mapRef.current?.animateTo(regionAround(location.coords, LOCATE_RADIUS_KM))
  }, [locatePending, location])

  // Show the whole trip once its route is known.
  const tripRoute = data.route
  useEffect(() => {
    if (mode !== 'trip' || !tripRoute) return
    mapRef.current?.fitTo(tripRoute.path)
  }, [mode, tripRoute])

  // Show all favourites once they are loaded.
  const favoritePoints = mode === 'favorites' ? visible : null
  useEffect(() => {
    if (favoritePoints && favoritePoints.length > 0) mapRef.current?.fitTo(favoritePoints)
  }, [favoritePoints])

  useEffect(() => {
    if (active.status === 'done') {
      AccessibilityInfo.announceForAccessibility(fr.resultsCount(visible.length))
    }
    // Announce when a load finishes, not on every list change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active.status])

  const toggleSheet = () => sheetRef.current?.snapToIndex(expanded ? 0 : 1)
  const locate = () => {
    setLocatePending(true)
    data.refreshLocation()
  }
  const goAround = (place: Place) => {
    setRouteModal(false)
    setFavoritesMode(false)
    setTrip(null)
    mapRef.current?.animateTo(regionAround(place, AROUND_RADIUS_KM))
  }
  const goRoute = (place: Place) => {
    setRouteModal(false)
    setFavoritesMode(false)
    setTrip(place)
  }

  const rowProps = useMemo(
    () => ({
      cheapestId: data.cheapestId,
      savings: data.savings,
      tankLiters: settings.tankLiters,
      isFavorite,
    }),
    [data.cheapestId, data.savings, settings.tankLiters, isFavorite],
  )

  const hydrating = mode === 'favorites' && !loaded
  const loadingFirst =
    hydrating ||
    (visible.length === 0 &&
      active.error === null &&
      (active.status === 'loading' || active.status === 'idle'))

  const emptyContent = loadingFirst ? (
    <StationSkeleton loadingLabel={fr.loadingResults} />
  ) : active.error && visible.length === 0 ? (
    <EmptyState
      title={fr.errorTitle}
      body={
        __DEV__
          ? `${errorBody(active.error.kind)} (${active.error.detail})`
          : errorBody(active.error.kind)
      }
      actionLabel={fr.retry}
      onAction={active.reload}
    />
  ) : mode === 'favorites' && favoriteIds.length === 0 ? (
    <EmptyState title={fr.favoritesEmptyTitle} body={fr.favoritesEmptyBody} />
  ) : (
    <EmptyState
      title={fr.emptyTitle}
      body={mode === 'trip' ? home.routeCorridor(0) : fr.emptyBody(fuelLabels[fuel], 0)}
    />
  )

  const footer = (
    <AppText variant="caption" tone="muted" style={styles.credit}>
      {`${fr.credit}
${fr.creditBrands}`}
    </AppText>
  )

  const hint =
    mode === 'area'
      ? home.areaHint
      : mode === 'trip' && data.route
        ? home.routeSummary(
            formatDistance(data.route.distanceMeters / 1000),
            formatDuration(data.route.durationSeconds),
          )
        : null

  if (!data.initialRegion) {
    return (
      <View style={[styles.screen, { backgroundColor: colors.background }]}>
        <LocatingScreen label={fr.locating} />
      </View>
    )
  }

  const bannerTop = insets.top + spacing.lg + MIN_TOUCH_TARGET
  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <StatusBar style="auto" />
      <StationMap
        stations={visible}
        cheapestId={data.cheapestId}
        initialRegion={data.initialRegion}
        mapType={mapType}
        routePath={data.routePath}
        destination={mode === 'trip' && trip ? trip : undefined}
        bottomInset={collapsedHeight}
        onRegionChange={data.onRegionChange}
        onSelect={setSelected}
        handle={mapRef}
      />

      <TopControls
        top={insets.top + spacing.sm}
        routeActive={trip !== null}
        onSettings={() => setSettingsVisible(true)}
        onRoute={() => (trip ? setTrip(null) : setRouteModal(true))}
      />

      <View pointerEvents="box-none" style={[styles.banners, { top: bannerTop }]}>
        {location.status === 'fallback' && (
          <Banner
            tone="warning"
            message={
              location.cause === 'denied' ? fr.locationDeniedBanner : fr.locationUnavailableBanner
            }
            actionLabel={
              location.cause === 'denied' && !location.canAskAgain
                ? fr.openSettings
                : fr.allowLocation
            }
            onAction={
              location.cause === 'denied' && !location.canAskAgain
                ? () => void Linking.openSettings()
                : data.refreshLocation
            }
          />
        )}
        {(loadFailed || saveFailed) && (
          <Banner tone="warning" message={loadFailed ? fr.preferencesLoadFailed : fr.saveFailed} />
        )}
        {triggered.length > 0 && (
          <Banner
            tone="warning"
            message={fr.alertsBanner(triggered.length)}
            actionLabel={fr.alertsSee}
            onAction={() => setSettingsVisible(true)}
          />
        )}
        {active.cachedAt && (
          <Banner
            tone="warning"
            message={fr.cachedBanner(formatUpdatedAt(active.cachedAt))}
            actionLabel={fr.retry}
            onAction={active.reload}
          />
        )}
        {active.error && visible.length > 0 && !active.cachedAt && (
          <Banner
            tone="warning"
            message={active.error.kind === 'network' ? fr.offlineBanner : fr.staleBanner}
            actionLabel={fr.retry}
            onAction={active.reload}
          />
        )}
      </View>

      {!expanded && (
        <SideControls
          bottom={collapsedHeight + spacing.md}
          satellite={mapType === 'satellite'}
          favoritesActive={favoritesMode}
          onToggleLayer={() => setMapType(mapType === 'standard' ? 'satellite' : 'standard')}
          onToggleFavorites={() => {
            setTrip(null)
            setFavoritesMode(!favoritesMode)
          }}
          onLocate={locate}
        />
      )}

      <StationSheet
        sheetRef={sheetRef}
        collapsedHeight={collapsedHeight}
        expanded={expanded}
        onIndexChange={(index) => setExpanded(index === 1)}
        onToggle={toggleSheet}
        summary={summaryFor(mode, active, visible.length, data.areaClamped)}
        hint={hint}
        stations={visible}
        rowProps={rowProps}
        fuel={fuel}
        onFuelChange={setFuel}
        sort={sort}
        onSortChange={setSort}
        brandOptions={data.brandOptions}
        brands={brands}
        onBrandsChange={setBrands}
        showBrandMenu={mode !== 'favorites'}
        emptyContent={emptyContent}
        footer={footer}
        onSelect={setSelected}
      />

      <RouteModal
        visible={routeModal}
        onClose={() => setRouteModal(false)}
        onAround={goAround}
        onRoute={goRoute}
      />
      <StationDetail
        station={selected}
        origin={origin}
        originIsFallback={location.status === 'fallback'}
        onClose={() => setSelected(null)}
      />
      <SettingsModal visible={settingsVisible} onClose={() => setSettingsVisible(false)} />
    </View>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  banners: { position: 'absolute', left: spacing.lg, right: spacing.lg },
  credit: { textAlign: 'center', marginTop: spacing.lg, paddingHorizontal: spacing.lg },
})
