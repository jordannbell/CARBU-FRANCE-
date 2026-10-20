import { Ionicons } from '@expo/vector-icons'
import { Pressable, StyleSheet, View } from 'react-native'
import { home } from '../../i18n/home'
import { useColors } from '../../theme/ThemeProvider'
import { MIN_TOUCH_TARGET, radius, spacing } from '../../theme/tokens'
import { AppText } from '../ui'

type IconName = keyof typeof Ionicons.glyphMap

const SHADOW = {
  shadowColor: '#000000',
  shadowOpacity: 0.18,
  shadowRadius: 6,
  shadowOffset: { width: 0, height: 2 },
  elevation: 4,
} as const

/** A 48 dp round button floating over the map. The label is read by screen readers. */
export function RoundButton({
  icon,
  label,
  onPress,
  active = false,
}: {
  icon: IconName
  label: string
  onPress: () => void
  active?: boolean
}) {
  const colors = useColors()
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.round,
        SHADOW,
        {
          backgroundColor: active ? colors.primary : colors.surface,
          borderColor: colors.border,
          opacity: pressed ? 0.8 : 1,
        },
      ]}
    >
      <Ionicons name={icon} size={22} color={active ? colors.primaryText : colors.text} />
    </Pressable>
  )
}

/** Settings button (top left) and the "Itinéraire" pill (top centre). */
export function TopControls({
  top,
  routeActive,
  onSettings,
  onRoute,
}: {
  top: number
  routeActive: boolean
  onSettings: () => void
  onRoute: () => void
}) {
  const colors = useColors()
  return (
    <View pointerEvents="box-none" style={[styles.top, { top }]}>
      <RoundButton icon="settings-outline" label={home.settingsButton} onPress={onSettings} />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={routeActive ? home.routeClear : home.routeButton}
        onPress={onRoute}
        style={({ pressed }) => [
          styles.pill,
          SHADOW,
          {
            backgroundColor: routeActive ? colors.primary : colors.surface,
            borderColor: colors.border,
            opacity: pressed ? 0.8 : 1,
          },
        ]}
      >
        <Ionicons
          name={routeActive ? 'close' : 'navigate-outline'}
          size={18}
          color={routeActive ? colors.primaryText : colors.text}
        />
        <AppText variant="label" tone={routeActive ? 'inverse' : 'default'}>
          {routeActive ? home.routeClear : home.routeButton}
        </AppText>
      </Pressable>
      {/* Same width as the settings button, so the pill stays centred. */}
      <View style={styles.spacer} />
    </View>
  )
}

/** Layers, favourites and "my position", stacked at the right, above the bottom sheet. */
export function SideControls({
  bottom,
  satellite,
  favoritesActive,
  onToggleLayer,
  onToggleFavorites,
  onLocate,
}: {
  bottom: number
  satellite: boolean
  favoritesActive: boolean
  onToggleLayer: () => void
  onToggleFavorites: () => void
  onLocate: () => void
}) {
  return (
    <View pointerEvents="box-none" style={[styles.side, { bottom }]}>
      <RoundButton
        icon="layers-outline"
        label={`${home.layersButton} : ${satellite ? home.layerSatellite : home.layerStandard}`}
        active={satellite}
        onPress={onToggleLayer}
      />
      <RoundButton
        icon={favoritesActive ? 'star' : 'star-outline'}
        label={favoritesActive ? home.favoritesOn : home.favoritesButton}
        active={favoritesActive}
        onPress={onToggleFavorites}
      />
      <RoundButton icon="locate-outline" label={home.locateButton} onPress={onLocate} />
    </View>
  )
}

const styles = StyleSheet.create({
  round: {
    width: MIN_TOUCH_TARGET,
    height: MIN_TOUCH_TARGET,
    borderRadius: MIN_TOUCH_TARGET / 2,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  top: {
    position: 'absolute',
    left: spacing.lg,
    right: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  pill: {
    minHeight: MIN_TOUCH_TARGET,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.xl,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  spacer: { width: MIN_TOUCH_TARGET },
  side: { position: 'absolute', right: spacing.lg, gap: spacing.sm },
})
