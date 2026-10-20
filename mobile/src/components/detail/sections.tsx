import { useMemo } from 'react'
import { StyleSheet, View } from 'react-native'
import type { FuelId, StationDetail } from '../../contract'
import { usePriceHistory, HISTORY_WINDOW_DAYS } from '../../data/hooks'
import { formatDate, formatEuros, formatPrice } from '../../format'
import { fr, fuelLabels } from '../../i18n/fr'
import { summarizeHistory } from '../../logic/history'
import { isoWeekday, openStatus } from '../../logic/openingHours'
import { useColors } from '../../theme/ThemeProvider'
import { radius, spacing, type ColorTokens } from '../../theme/tokens'
import { PriceChart } from '../PriceChart'
import { AppText, Banner } from '../ui'

const makeStyles = (colors: ColorTokens) =>
  StyleSheet.create({
    section: { gap: spacing.sm },
    card: {
      backgroundColor: colors.surface,
      borderRadius: radius.lg,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.xs,
    },
    row: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'baseline',
      paddingVertical: spacing.md,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    lastRow: { borderBottomWidth: 0 },
    flags: { flexDirection: 'row', gap: spacing.sm, alignItems: 'baseline' },
  })

export function SectionTitle({ children }: { children: string }) {
  return (
    <AppText variant="bodyStrong" accessibilityRole="header">
      {children}
    </AppText>
  )
}

export function PricesSection({ detail }: { detail: StationDetail }) {
  const colors = useColors()
  const styles = useMemo(() => makeStyles(colors), [colors])
  const shortageByFuel = new Map(detail.shortages.map((s) => [s.fuel, s.type]))

  return (
    <View style={styles.section}>
      <SectionTitle>{fr.pricesTitle}</SectionTitle>
      <View style={styles.card}>
        {detail.prices.map((entry, index) => {
          const shortage = shortageByFuel.get(entry.fuel)
          const last = index === detail.prices.length - 1
          return (
            <View
              key={entry.fuel}
              accessible
              accessibilityLabel={`${fuelLabels[entry.fuel]}, ${formatPrice(entry.price)} ${fr.perLiter}${entry.stale ? `, ${fr.priceStale}` : ''}${shortage ? `, ${fr.priceShortage}` : ''}`}
              style={[styles.row, last && styles.lastRow]}
            >
              <AppText>{fuelLabels[entry.fuel]}</AppText>
              <View style={styles.flags}>
                {entry.stale && (
                  <AppText variant="caption" tone="warning">
                    {fr.priceStale}
                  </AppText>
                )}
                {shortage && (
                  <AppText variant="caption" tone="warning">
                    {fr.priceShortage}
                  </AppText>
                )}
                <AppText variant="bodyStrong">
                  {formatPrice(entry.price)} {fr.perLiter}
                </AppText>
              </View>
            </View>
          )
        })}
      </View>
    </View>
  )
}

export function HoursSection({ detail, now }: { detail: StationDetail; now: Date }) {
  const colors = useColors()
  const styles = useMemo(() => makeStyles(colors), [colors])
  const status = openStatus(detail.hours, detail.open24h, now)
  const today = isoWeekday(now)

  const statusText =
    status.state === 'always'
      ? fr.openAlways
      : status.state === 'open'
        ? fr.openUntil(status.until)
        : status.state === 'closed'
          ? status.opensAt
            ? fr.closedOpensAt(status.opensAt)
            : fr.closedNow
          : fr.hoursUnknown

  return (
    <View style={styles.section}>
      <SectionTitle>{fr.hoursTitle}</SectionTitle>
      <AppText tone={status.state === 'open' || status.state === 'always' ? 'success' : 'muted'}>
        {statusText}
      </AppText>
      {detail.hours.length > 0 && (
        <View style={styles.card}>
          {detail.hours.map((day, index) => {
            const isToday = day.day === today
            const last = index === detail.hours.length - 1
            const text = day.closed
              ? fr.closedDay
              : day.ranges.map((range) => `${range.open} – ${range.close}`).join(', ')
            return (
              <View
                key={day.day}
                accessible
                accessibilityLabel={`${fr.dayNames[day.day - 1] ?? ''}${isToday ? `, ${fr.today}` : ''} : ${text}`}
                style={[styles.row, last && styles.lastRow]}
              >
                <AppText variant={isToday ? 'bodyStrong' : 'body'}>
                  {fr.dayNames[day.day - 1] ?? ''}
                </AppText>
                <AppText
                  variant={isToday ? 'bodyStrong' : 'body'}
                  tone={day.closed ? 'muted' : 'default'}
                >
                  {text}
                </AppText>
              </View>
            )
          })}
        </View>
      )}
    </View>
  )
}

export function ServicesSection({ services }: { services: readonly string[] }) {
  const colors = useColors()
  const styles = useMemo(() => makeStyles(colors), [colors])
  if (services.length === 0) return null
  return (
    <View style={styles.section}>
      <SectionTitle>{fr.servicesTitle}</SectionTitle>
      <AppText tone="muted">{services.join(' · ')}</AppText>
    </View>
  )
}

export function HistorySection({
  stationId,
  fuel,
  currentPrice,
  nowMs,
}: {
  stationId: number
  fuel: FuelId
  currentPrice: number
  nowMs: number
}) {
  const colors = useColors()
  const styles = useMemo(() => makeStyles(colors), [colors])
  const { state, reload } = usePriceHistory(stationId, fuel)
  const history = state.data
  const summary = history ? summarizeHistory(history.points) : null
  const enough = history !== undefined && history.points.length >= 2 && summary !== null

  const changeText = !summary
    ? ''
    : summary.change > 0
      ? fr.historyChangeUp(formatEuros(summary.change))
      : summary.change < 0
        ? fr.historyChangeDown(formatEuros(-summary.change))
        : fr.historyChangeFlat

  return (
    <View style={styles.section}>
      <SectionTitle>{`${fr.historyTitle} · ${fuelLabels[fuel]}`}</SectionTitle>
      {state.status === 'error' && (
        <Banner
          tone="warning"
          message={fr.historyLoadError}
          actionLabel={fr.retry}
          onAction={reload}
        />
      )}
      {history && enough && summary && (
        <>
          <PriceChart points={history.points} days={history.days} nowMs={nowMs} />
          <AppText accessibilityLiveRegion="polite">
            {fr.historySummary({
              days: HISTORY_WINDOW_DAYS,
              min: formatPrice(summary.min),
              max: formatPrice(summary.max),
              current: formatPrice(currentPrice),
              change: changeText,
            })}
          </AppText>
        </>
      )}
      {history && !enough && <AppText tone="muted">{fr.historyTooShort}</AppText>}
      {history?.since && (
        <AppText variant="caption" tone="muted">
          {fr.historySince(formatDate(history.since))}
        </AppText>
      )}
    </View>
  )
}
