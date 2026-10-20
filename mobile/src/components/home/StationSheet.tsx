import BottomSheet, { BottomSheetFlatList } from '@gorhom/bottom-sheet'
import { useCallback, useMemo, type ReactNode, type RefObject } from 'react'
import { Pressable, StyleSheet, View } from 'react-native'
import type { BrandOption, FuelId, SortMode, StationResult } from '../../contract'
import { home } from '../../i18n/home'
import { useColors } from '../../theme/ThemeProvider'
import { MIN_TOUCH_TARGET, radius, spacing } from '../../theme/tokens'
import { StationRow } from '../StationRow'
import { AppText } from '../ui'
import { BrandMenu, FuelMenu, SortMenu } from './SheetMenus'

export interface SheetRowProps {
  readonly cheapestId: number | undefined
  readonly savings: ReadonlyMap<number, number>
  readonly tankLiters: number
  readonly isFavorite: (id: number) => boolean
}

/**
 * The bottom panel: the number of stations in view, the menus, and the list. Two snap points: the
 * summary alone (map stays visible) and a tall list. The list is the accessible twin of the map.
 */
export function StationSheet({
  sheetRef,
  collapsedHeight,
  expanded,
  onIndexChange,
  onToggle,
  summary,
  hint,
  stations,
  rowProps,
  fuel,
  onFuelChange,
  sort,
  onSortChange,
  brandOptions,
  brands,
  onBrandsChange,
  showBrandMenu,
  emptyContent,
  footer,
  onSelect,
}: {
  sheetRef: RefObject<BottomSheet | null>
  collapsedHeight: number
  expanded: boolean
  onIndexChange: (index: number) => void
  onToggle: () => void
  summary: string
  hint: string | null
  stations: readonly StationResult[]
  rowProps: SheetRowProps
  fuel: FuelId
  onFuelChange: (fuel: FuelId) => void
  sort: SortMode
  onSortChange: (sort: SortMode) => void
  brandOptions: readonly BrandOption[]
  brands: readonly string[]
  onBrandsChange: (brands: readonly string[]) => void
  showBrandMenu: boolean
  emptyContent: ReactNode
  footer: ReactNode
  onSelect: (station: StationResult) => void
}) {
  const colors = useColors()
  const snapPoints = useMemo(() => [collapsedHeight, '88%'], [collapsedHeight])

  const renderItem = useCallback(
    ({ item }: { item: StationResult }) => (
      <StationRow
        station={item}
        position="middle"
        isCheapest={item.id === rowProps.cheapestId}
        savingEur={rowProps.savings.get(item.id)}
        tankLiters={rowProps.tankLiters}
        isFavorite={rowProps.isFavorite(item.id)}
        onPress={onSelect}
      />
    ),
    [rowProps, onSelect],
  )

  const header = (
    <View style={styles.header}>
      <View style={styles.summaryRow}>
        <View style={styles.summaryText} accessibilityLiveRegion="polite">
          <AppText variant="bodyStrong">{summary}</AppText>
          {hint && (
            <AppText variant="caption" tone="muted">
              {hint}
            </AppText>
          )}
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={expanded ? home.mapButton : home.listButton}
          accessibilityHint={expanded ? home.listCloseHint : home.listOpenHint}
          onPress={onToggle}
          style={({ pressed }) => [
            styles.listButton,
            { backgroundColor: colors.primary, opacity: pressed ? 0.8 : 1 },
          ]}
        >
          <AppText variant="label" tone="inverse">
            {expanded ? home.mapButton : home.listButton}
          </AppText>
        </Pressable>
      </View>
      <View style={styles.menus}>
        <FuelMenu fuel={fuel} onChange={onFuelChange} />
        {showBrandMenu && (
          <BrandMenu options={brandOptions} selected={brands} onChange={onBrandsChange} />
        )}
      </View>
      <View style={styles.menus}>
        <SortMenu sort={sort} onChange={onSortChange} />
        <View style={{ flex: 1 }} />
      </View>
    </View>
  )

  return (
    <BottomSheet
      ref={sheetRef}
      index={0}
      snapPoints={snapPoints}
      onChange={onIndexChange}
      enablePanDownToClose={false}
      backgroundStyle={{ backgroundColor: colors.background }}
      handleIndicatorStyle={{ backgroundColor: colors.border }}
    >
      <BottomSheetFlatList
        data={stations}
        keyExtractor={(item: StationResult) => String(item.id)}
        renderItem={renderItem}
        ListHeaderComponent={header}
        ListEmptyComponent={<View style={styles.empty}>{emptyContent}</View>}
        ListFooterComponent={<View>{footer}</View>}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.content}
      />
    </BottomSheet>
  )
}

const styles = StyleSheet.create({
  content: { paddingBottom: spacing.xxl * 2 },
  header: { gap: spacing.sm, paddingHorizontal: spacing.lg, paddingBottom: spacing.md },
  summaryRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  summaryText: { flex: 1, gap: spacing.xs },
  listButton: {
    minHeight: MIN_TOUCH_TARGET,
    paddingHorizontal: spacing.xl,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
  },
  menus: { flexDirection: 'row', gap: spacing.sm },
  empty: { paddingHorizontal: spacing.lg },
})
