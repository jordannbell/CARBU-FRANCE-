import { useEffect, useImperativeHandle, useRef, useState, type Ref } from 'react'
import { StyleSheet, View } from 'react-native'
import MapView, {
  Marker,
  Polyline,
  type MapType,
  type Region as NativeRegion,
} from 'react-native-maps'
import type { StationResult } from '../contract'
import { formatPrice } from '../format'
import { fr } from '../i18n/fr'
import type { Region } from '../logic/region'
import { useColors } from '../theme/ThemeProvider'
import { radius, spacing } from '../theme/tokens'
import { BrandBadge } from './home/BrandBadge'
import { AppText } from './ui'

const FIT_PADDING = { top: 120, right: 48, bottom: 320, left: 48 }
const ANIMATION_MS = 400
// Custom marker views are snapshotted once; leaving tracking on would redraw them every frame.
const SNAPSHOT_DELAY_MS = 600
const ROUTE_WIDTH = 5

export interface MapPoint {
  readonly latitude: number
  readonly longitude: number
}

export interface StationMapHandle {
  animateTo: (region: Region) => void
  fitTo: (points: readonly MapPoint[]) => void
}

/**
 * Full-screen map with one price badge per station. The list in the bottom sheet is the accessible
 * equivalent of this map, so the map itself is hidden from screen readers. A badge is highlighted
 * as the cheapest only if its price is reliable.
 */
export function StationMap({
  stations,
  cheapestId,
  initialRegion,
  mapType,
  routePath,
  destination,
  bottomInset,
  onRegionChange,
  onSelect,
  handle,
}: {
  stations: readonly StationResult[]
  cheapestId: number | undefined
  initialRegion: Region
  mapType: MapType
  /** Itinerary to draw, if any. */
  routePath?: readonly MapPoint[]
  destination?: MapPoint
  /** Height covered by the bottom sheet, so the map's own controls and legal text stay visible. */
  bottomInset: number
  onRegionChange: (region: Region) => void
  onSelect: (station: StationResult) => void
  handle: Ref<StationMapHandle>
}) {
  const colors = useColors()
  const mapRef = useRef<MapView>(null)
  const [tracking, setTracking] = useState(true)

  useImperativeHandle(handle, () => ({
    animateTo: (region) => mapRef.current?.animateToRegion(region, ANIMATION_MS),
    fitTo: (points) =>
      mapRef.current?.fitToCoordinates([...points], { edgePadding: FIT_PADDING, animated: true }),
  }))

  useEffect(() => {
    setTracking(true)
    const snapshot = setTimeout(() => setTracking(false), SNAPSHOT_DELAY_MS)
    return () => clearTimeout(snapshot)
  }, [stations, cheapestId, colors])

  return (
    <View
      style={StyleSheet.absoluteFill}
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
    >
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFill}
        mapType={mapType}
        initialRegion={initialRegion}
        showsUserLocation
        showsMyLocationButton={false}
        toolbarEnabled={false}
        rotateEnabled={false}
        pitchEnabled={false}
        mapPadding={{ top: 0, right: 0, bottom: bottomInset, left: 0 }}
        onRegionChangeComplete={(region: NativeRegion) => onRegionChange(region)}
      >
        {routePath && routePath.length > 1 && (
          <Polyline
            coordinates={[...routePath]}
            strokeColor={colors.route}
            strokeWidth={ROUTE_WIDTH}
          />
        )}
        {destination && <Marker coordinate={destination} pinColor={colors.route} />}
        {stations.map((station) => {
          const best = station.id === cheapestId
          return (
            <Marker
              key={station.id}
              coordinate={{ latitude: station.latitude, longitude: station.longitude }}
              tracksViewChanges={tracking}
              onPress={() => onSelect(station)}
              accessibilityLabel={fr.mapPriceLabel(
                formatPrice(station.price),
                station.address,
                station.brand,
              )}
            >
              <View
                style={[
                  styles.bubble,
                  {
                    backgroundColor: best ? colors.success : colors.surface,
                    borderColor: best ? colors.success : colors.border,
                  },
                ]}
              >
                {station.brand && station.brandGroup && (
                  <BrandBadge brand={station.brand} group={station.brandGroup} />
                )}
                <AppText variant="label" tone={best ? 'inverse' : 'default'}>
                  {station.price.toFixed(3).replace('.', ',')}
                </AppText>
              </View>
            </Marker>
          )
        })}
      </MapView>
    </View>
  )
}

const styles = StyleSheet.create({
  bubble: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: 2,
    paddingLeft: 3,
    paddingRight: spacing.sm,
    minHeight: 30,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
})
