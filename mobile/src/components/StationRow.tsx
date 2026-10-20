import { memo, useMemo } from 'react'
import { Pressable, StyleSheet, View } from 'react-native'
import type { StationResult } from '../contract'
import {
  formatDistance,
  formatEuros,
  formatPrice,
  formatUpdatedAt,
  isSameLocalDay,
} from '../format'
import { fr } from '../i18n/fr'
import { home } from '../i18n/home'
import { useColors } from '../theme/ThemeProvider'
import { ROW_MIN_HEIGHT, radius, spacing, type ColorTokens } from '../theme/tokens'
import { BrandBadge } from './home/BrandBadge'
import { AppText } from './ui'

export type RowPosition = 'first' | 'middle' | 'last' | 'only'

export const rowRadius = (position: RowPosition) => ({
  borderTopLeftRadius: position === 'first' || position === 'only' ? radius.lg : 0,
  borderTopRightRadius: position === 'first' || position === 'only' ? radius.lg : 0,
  borderBottomLeftRadius: position === 'last' || position === 'only' ? radius.lg : 0,
  borderBottomRightRadius: position === 'last' || position === 'only' ? radius.lg : 0,
})

export const makeRowStyles = (colors: ColorTokens) =>
  StyleSheet.create({
    row: {
      minHeight: ROW_MIN_HEIGHT,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.md,
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      backgroundColor: colors.surface,
    },
    divider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
    body: { flex: 1, gap: spacing.xs },
    priceBlock: { alignItems: 'flex-end', flexShrink: 0 },
    notes: { flexDirection: 'row', flexWrap: 'wrap', columnGap: spacing.md },
  })

function StationRowBase({
  station,
  position,
  isCheapest,
  savingEur,
  tankLiters,
  isFavorite,
  onPress,
}: {
  station: StationResult
  position: RowPosition
  isCheapest: boolean
  /** Saving on a full tank versus the most expensive usable station of the list, if worth showing. */
  savingEur?: number
  tankLiters: number
  isFavorite: boolean
  onPress: (station: StationResult) => void
}) {
  const colors = useColors()
  const styles = useMemo(() => makeRowStyles(colors), [colors])

  const notes: { text: string; tone: 'success' | 'warning' | 'muted' }[] = [
    ...(isCheapest ? [{ text: fr.cheapest, tone: 'success' as const }] : []),
    ...(station.shortage?.type === 'temporaire'
      ? [{ text: fr.shortageTemporary, tone: 'warning' as const }]
      : []),
    ...(station.stale ? [{ text: fr.stalePrice, tone: 'warning' as const }] : []),
    ...(savingEur !== undefined
      ? [{ text: fr.saving(formatEuros(savingEur), tankLiters), tone: 'success' as const }]
      : []),
    ...(station.open24h ? [{ text: fr.open24h, tone: 'muted' as const }] : []),
    ...(isFavorite ? [{ text: fr.isFavorite, tone: 'muted' as const }] : []),
  ]

  const price = formatPrice(station.price)
  const distance = formatDistance(station.distanceKm)
  const label = fr.rowLabel({
    price,
    distance,
    address: station.address,
    city: station.city,
    brand: station.brand,
    notes: notes.map((note) => note.text),
  })
  const isLast = position === 'last' || position === 'only'

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={fr.openDetail}
      onPress={() => onPress(station)}
      style={({ pressed }) => [
        styles.row,
        rowRadius(position),
        !isLast && styles.divider,
        pressed && { backgroundColor: colors.surfaceMuted },
      ]}
    >
      {station.brand && station.brandGroup && (
        <BrandBadge brand={station.brand} group={station.brandGroup} size={36} />
      )}
      <View style={styles.body}>
        <AppText variant="bodyStrong" numberOfLines={2}>
          {station.brand ?? station.address}
        </AppText>
        <AppText variant="label" tone="muted">
          {station.brand ? `${station.address}, ` : `${station.postalCode} `}
          {station.city} · {distance}
        </AppText>
        {notes.length > 0 && (
          <View style={styles.notes}>
            {notes.map((note) => (
              <AppText key={note.text} variant="caption" tone={note.tone}>
                {note.text}
              </AppText>
            ))}
          </View>
        )}
        <AppText variant="caption" tone="muted">
          {isSameLocalDay(station.updatedAt, new Date())
            ? home.verifiedToday
            : fr.updatedOn(formatUpdatedAt(station.updatedAt))}
        </AppText>
      </View>
      <View style={styles.priceBlock}>
        <AppText variant="price">{price.replace(' €', '')}</AppText>
        <AppText variant="caption" tone="muted">
          {fr.perLiter}
        </AppText>
      </View>
    </Pressable>
  )
}

export const StationRow = memo(StationRowBase)
