import { useMemo } from 'react'
import { ActivityIndicator, Pressable, StyleSheet, TextInput, View } from 'react-native'
import type { Place } from '../contract'
import { usePlaceSearch } from '../data/hooks'
import { fr } from '../i18n/fr'
import { useColors } from '../theme/ThemeProvider'
import { MIN_TOUCH_TARGET, radius, spacing, typography, type ColorTokens } from '../theme/tokens'
import { AppText } from './ui'

const makeStyles = (colors: ColorTokens) =>
  StyleSheet.create({
    field: {
      flexDirection: 'row',
      alignItems: 'center',
      minHeight: MIN_TOUCH_TARGET,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      paddingHorizontal: spacing.md,
      gap: spacing.sm,
    },
    input: { flex: 1, color: colors.text, paddingVertical: spacing.sm, ...typography.body },
    clear: { minHeight: MIN_TOUCH_TARGET, minWidth: MIN_TOUCH_TARGET, justifyContent: 'center' },
    list: {
      marginTop: spacing.xs,
      borderRadius: radius.md,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
    },
    option: {
      minHeight: MIN_TOUCH_TARGET,
      justifyContent: 'center',
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
    },
    divider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  })

/** Address autocomplete. Picking a suggestion hands its coordinates to `onSelect`. */
export function PlaceSearch({
  text,
  onTextChange,
  onSelect,
}: {
  text: string
  onTextChange: (text: string) => void
  onSelect: (place: Place) => void
}) {
  const colors = useColors()
  const styles = useMemo(() => makeStyles(colors), [colors])
  const { state, isTooShort, reload } = usePlaceSearch(text)

  const places = state.data ?? []
  const showResults = !isTooShort && state.status === 'done' && places.length > 0

  const choose = (place: Place) => {
    onTextChange('')
    onSelect(place)
  }

  return (
    <View>
      <View style={styles.field}>
        <TextInput
          value={text}
          onChangeText={onTextChange}
          accessibilityLabel={fr.placeSearchLabel}
          placeholder={fr.placeSearchPlaceholder}
          placeholderTextColor={colors.textMuted}
          style={styles.input}
          autoCorrect={false}
          autoCapitalize="none"
          returnKeyType="search"
          clearButtonMode="never"
        />
        {state.status === 'loading' && (
          <ActivityIndicator accessibilityLabel={fr.placeLoading} color={colors.primary} />
        )}
        {text.length > 0 && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={fr.placeClear}
            onPress={() => onTextChange('')}
            style={styles.clear}
          >
            <AppText variant="label" tone="muted">
              ✕
            </AppText>
          </Pressable>
        )}
      </View>

      {text.trim().length > 0 && isTooShort && (
        <AppText variant="caption" tone="muted" style={{ marginTop: spacing.xs }}>
          {fr.placeTooShort}
        </AppText>
      )}
      {!isTooShort && state.status === 'done' && places.length === 0 && (
        <AppText variant="caption" tone="muted" style={{ marginTop: spacing.xs }}>
          {fr.placeNone}
        </AppText>
      )}
      {state.status === 'error' && (
        <Pressable accessibilityRole="button" onPress={reload} style={{ marginTop: spacing.xs }}>
          <AppText variant="caption" tone="danger" accessibilityLiveRegion="polite">
            {fr.placeError} {fr.retry}
          </AppText>
        </Pressable>
      )}

      {showResults && (
        <View style={styles.list} accessibilityRole="list">
          {places.map((place, index) => (
            <Pressable
              key={`${place.label}|${place.latitude}|${place.longitude}`}
              accessibilityRole="button"
              accessibilityLabel={place.label}
              onPress={() => choose(place)}
              style={({ pressed }) => [
                styles.option,
                index < places.length - 1 && styles.divider,
                pressed && { backgroundColor: colors.surfaceMuted },
              ]}
            >
              <AppText>{place.label}</AppText>
            </Pressable>
          ))}
          <AppText variant="caption" tone="muted" style={{ padding: spacing.sm }}>
            {fr.placeAttribution}
          </AppText>
        </View>
      )}
    </View>
  )
}
