import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Linking,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native'
import MapView, { Marker, Polyline } from 'react-native-maps'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import type { ApiErrorKind } from '../api'
import type { StationResult } from '../contract'
import { useRoute, useStationDetail } from '../data/hooks'
import { formatDistance, formatDuration, formatPrice, formatUpdatedAt } from '../format'
import { fr, fuelLabels } from '../i18n/fr'
import { buildDirectionsUrl } from '../maps'
import { useAppState } from '../state/AppState'
import { useColors } from '../theme/ThemeProvider'
import { radius, spacing, type ColorTokens } from '../theme/tokens'
import type { Coordinates } from '../useUserLocation'
import { AlertSection } from './detail/AlertSection'
import { HistorySection, HoursSection, PricesSection, ServicesSection } from './detail/sections'
import { AppText, Banner, Button } from './ui'

const MAP_EDGE_PADDING = { top: 56, right: 48, bottom: 56, left: 48 }
const INITIAL_DELTA = 0.04

const routeErrorBody = (kind: ApiErrorKind): string =>
  ({
    unavailable: fr.routeUnavailableBody,
    'no-route': fr.routeNoRouteBody,
    'too-far': fr.routeTooFarBody,
    network: fr.offlineBody,
    timeout: fr.timeoutBody,
    'rate-limited': fr.rateLimitedBody,
    'not-found': fr.routeFailedBody,
    'too-many': fr.routeFailedBody,
    server: fr.routeFailedBody,
    invalid: fr.routeFailedBody,
  })[kind]

// Retrying cannot help when the station is out of range or has no road access.
const isRetryable = (kind: ApiErrorKind): boolean => kind !== 'no-route' && kind !== 'too-far'

const makeStyles = (colors: ColorTokens) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.background },
    content: { padding: spacing.lg, gap: spacing.lg },
    topBar: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm },
    map: {
      height: 280,
      borderRadius: radius.lg,
      overflow: 'hidden',
      backgroundColor: colors.surfaceMuted,
    },
    summary: { gap: spacing.xs },
    loading: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  })

export function StationDetail({
  station,
  origin,
  originIsFallback,
  onClose,
}: {
  station: StationResult | null
  origin: Coordinates | null
  originIsFallback: boolean
  onClose: () => void
}) {
  const colors = useColors()
  const styles = useMemo(() => makeStyles(colors), [colors])
  const insets = useSafeAreaInsets()
  const mapRef = useRef<MapView>(null)
  const { isFavorite, toggleFavorite } = useAppState()
  const [navigationFailed, setNavigationFailed] = useState(false)
  // A stable clock for the opening status and the chart window while the screen is open.
  const now = useMemo(() => new Date(), [station])

  const stationId = station?.id ?? null
  const { state: detail } = useStationDetail(stationId)
  const { state: route, reload: reloadRoute } = useRoute(stationId, origin)

  const stationPoint = useMemo(
    () => (station ? { latitude: station.latitude, longitude: station.longitude } : null),
    [station],
  )

  // Frame the whole route once it is known, otherwise just the two endpoints.
  useEffect(() => {
    if (!stationPoint) return
    const path = route.status === 'done' ? route.data.path : []
    const points = path.length > 1 ? path : origin ? [origin, stationPoint] : [stationPoint]
    mapRef.current?.fitToCoordinates([...points], { edgePadding: MAP_EDGE_PADDING, animated: true })
  }, [route, origin, stationPoint])

  const startNavigation = () => {
    if (!station) return
    setNavigationFailed(false)
    const url = buildDirectionsUrl(
      Platform.OS === 'ios' ? 'ios' : 'android',
      station.latitude,
      station.longitude,
      station.address,
    )
    Linking.openURL(url).catch(() => setNavigationFailed(true))
  }

  const favorite = station ? isFavorite(station.id) : false

  return (
    <Modal visible={station !== null} animationType="slide" onRequestClose={onClose}>
      {station && stationPoint && (
        <View style={[styles.screen, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
          <ScrollView contentContainerStyle={styles.content}>
            <View style={styles.topBar}>
              <Button
                label={favorite ? fr.removeFavorite : fr.addFavorite}
                variant="secondary"
                onPress={() => toggleFavorite(station.id)}
              />
              <Button label={fr.close} variant="secondary" onPress={onClose} />
            </View>

            <View style={styles.summary}>
              <AppText variant="title" accessibilityRole="header">
                {station.brand ?? station.address}
              </AppText>
              <AppText variant="label" tone="muted">
                {station.brand ? `${station.address}, ` : ''}
                {station.postalCode} {station.city} · {formatDistance(station.distanceKm)}
              </AppText>
              <AppText>
                {fuelLabels[station.fuel]} · {formatPrice(station.price)} {fr.perLiter}
              </AppText>
              <AppText variant="caption" tone="muted">
                {fr.updatedOn(formatUpdatedAt(station.updatedAt))}
              </AppText>
            </View>

            {route.status === 'done' && (
              <AppText variant="bodyStrong" accessibilityLiveRegion="polite">
                {fr.routeSummary(
                  formatDistance(route.data.distanceMeters / 1000),
                  formatDuration(route.data.durationSeconds),
                )}
              </AppText>
            )}
            {route.status === 'loading' && (
              <View style={styles.loading} accessibilityLiveRegion="polite">
                <ActivityIndicator color={colors.primary} />
                <AppText tone="muted">{fr.routeLoading}</AppText>
              </View>
            )}
            {route.status === 'error' && (
              <Banner
                tone="warning"
                message={
                  __DEV__
                    ? `${routeErrorBody(route.kind)} (${route.detail})`
                    : routeErrorBody(route.kind)
                }
                actionLabel={isRetryable(route.kind) ? fr.retry : undefined}
                onAction={isRetryable(route.kind) ? reloadRoute : undefined}
              />
            )}
            {originIsFallback && <Banner tone="warning" message={fr.routeFromParis} />}

            {/* The map is decorative for screen readers: the summary above carries the information. */}
            <View
              style={styles.map}
              accessible={false}
              importantForAccessibility="no-hide-descendants"
              accessibilityElementsHidden
            >
              <MapView
                ref={mapRef}
                style={StyleSheet.absoluteFill}
                initialRegion={{
                  ...stationPoint,
                  latitudeDelta: INITIAL_DELTA,
                  longitudeDelta: INITIAL_DELTA,
                }}
              >
                <Marker coordinate={stationPoint} title={station.address} />
                {origin && (
                  <Marker coordinate={origin} title={fr.yourPosition} pinColor={colors.route} />
                )}
                {route.status === 'done' && (
                  <Polyline
                    coordinates={[...route.data.path]}
                    strokeColor={colors.route}
                    strokeWidth={5}
                  />
                )}
              </MapView>
            </View>
            <AppText variant="caption" tone="muted">
              {route.status === 'done' && route.data.provider === 'osrm'
                ? fr.mapAttributionOsrm
                : fr.mapAttribution}
            </AppText>

            {navigationFailed && (
              <Banner
                tone="danger"
                message={fr.mapsFailed}
                actionLabel={fr.close}
                onAction={() => setNavigationFailed(false)}
              />
            )}
            <Button label={fr.startNavigation} onPress={startNavigation} />

            {detail.status === 'loading' && (
              <View style={styles.loading} accessibilityLiveRegion="polite">
                <ActivityIndicator color={colors.primary} />
                <AppText tone="muted">{fr.loadingResults}</AppText>
              </View>
            )}
            {detail.status === 'error' && <Banner tone="warning" message={fr.detailLoadError} />}
            {detail.data && (
              <>
                <PricesSection detail={detail.data} />
                <HoursSection detail={detail.data} now={now} />
                <ServicesSection services={detail.data.services} />
              </>
            )}
            <AlertSection station={station} />
            <HistorySection
              stationId={station.id}
              fuel={station.fuel}
              currentPrice={station.price}
              nowMs={now.getTime()}
            />
          </ScrollView>
        </View>
      )}
    </Modal>
  )
}
