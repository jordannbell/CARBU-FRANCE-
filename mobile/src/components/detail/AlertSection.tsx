import { useEffect, useMemo, useState } from 'react'
import { Pressable, StyleSheet, View } from 'react-native'
import type { StationResult } from '../../contract'
import { formatPrice } from '../../format'
import { fr, fuelLabels } from '../../i18n/fr'
import {
  MAX_THRESHOLD_EUR,
  MIN_THRESHOLD_EUR,
  THRESHOLD_COARSE_STEP,
  THRESHOLD_FINE_STEP,
  isAlreadyReached,
  stepThreshold,
  suggestThreshold,
} from '../../logic/alerts'
import { useAlerts } from '../../state/Alerts'
import { useColors } from '../../theme/ThemeProvider'
import { MIN_TOUCH_TARGET, radius, spacing, type ColorTokens } from '../../theme/tokens'
import { AppText, Banner, Button } from '../ui'
import { SectionTitle } from './sections'

const makeStyles = (colors: ColorTokens) =>
  StyleSheet.create({
    section: { gap: spacing.sm },
    card: {
      backgroundColor: colors.surface,
      borderRadius: radius.lg,
      padding: spacing.lg,
      gap: spacing.md,
    },
    stepper: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing.xs,
    },
    step: {
      minHeight: MIN_TOUCH_TARGET,
      minWidth: MIN_TOUCH_TARGET,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: radius.pill,
      backgroundColor: colors.surfaceMuted,
      paddingHorizontal: spacing.sm,
    },
  })

const stepLabel = (step: number) => `${step.toFixed(2).replace('.', ',')} €`

export function AlertSection({ station }: { station: StationResult }) {
  const colors = useColors()
  const styles = useMemo(() => makeStyles(colors), [colors])
  const { ready, alertFor, create, remove, actionError, pushStatus } = useAlerts()
  const existing = alertFor(station.id, station.fuel)
  const [threshold, setThreshold] = useState(
    () => existing?.threshold ?? suggestThreshold(station.price),
  )
  const [busy, setBusy] = useState(false)

  // Follow the saved alert when it loads or changes elsewhere.
  const savedThreshold = existing?.threshold
  useEffect(() => {
    if (savedThreshold !== undefined) setThreshold(savedThreshold)
  }, [savedThreshold])

  const move = (delta: number) => setThreshold((value) => stepThreshold(value, delta))
  const submit = async () => {
    setBusy(true)
    await create(station.id, station.fuel, threshold)
    setBusy(false)
  }
  const stepButton = (delta: number, label: string, accessibility: string) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibility}
      disabled={
        busy || (delta < 0 ? threshold <= MIN_THRESHOLD_EUR : threshold >= MAX_THRESHOLD_EUR)
      }
      onPress={() => move(delta)}
      style={styles.step}
    >
      <AppText variant="label">{label}</AppText>
    </Pressable>
  )

  const unchanged = existing !== undefined && existing.threshold === threshold
  const pushMessage =
    pushStatus === 'enabled'
      ? fr.pushEnabled
      : pushStatus === 'denied'
        ? fr.pushDenied
        : pushStatus === 'unsupported-expo-go-android'
          ? fr.pushUnsupportedExpoGoAndroid
          : pushStatus === 'unsupported-no-project'
            ? fr.pushUnsupportedNoProject
            : pushStatus === 'error'
              ? fr.pushError
              : ''

  return (
    <View style={styles.section}>
      <SectionTitle>{`${fr.alertsTitle} · ${fuelLabels[station.fuel]}`}</SectionTitle>
      <View style={styles.card}>
        {existing ? (
          <AppText
            accessibilityLiveRegion="polite"
            tone={existing.triggeredAt ? 'success' : 'default'}
          >
            {existing.triggeredAt && existing.currentPrice !== null
              ? fr.alertTriggered(formatPrice(existing.currentPrice))
              : fr.alertActive(formatPrice(existing.threshold))}
          </AppText>
        ) : (
          <AppText tone="muted">{fr.alertsIntro}</AppText>
        )}

        <View accessibilityRole="adjustable" accessibilityLabel={fr.alertThresholdLabel}>
          <View style={styles.stepper}>
            {stepButton(
              -THRESHOLD_COARSE_STEP,
              `−${stepLabel(THRESHOLD_COARSE_STEP)}`,
              fr.alertLower(stepLabel(THRESHOLD_COARSE_STEP)),
            )}
            {stepButton(
              -THRESHOLD_FINE_STEP,
              `−${stepLabel(THRESHOLD_FINE_STEP)}`,
              fr.alertLower(stepLabel(THRESHOLD_FINE_STEP)),
            )}
            <AppText
              variant="price"
              accessibilityLiveRegion="polite"
              style={{ flexShrink: 1, textAlign: 'center' }}
            >
              {formatPrice(threshold)}
            </AppText>
            {stepButton(
              THRESHOLD_FINE_STEP,
              `+${stepLabel(THRESHOLD_FINE_STEP)}`,
              fr.alertRaise(stepLabel(THRESHOLD_FINE_STEP)),
            )}
            {stepButton(
              THRESHOLD_COARSE_STEP,
              `+${stepLabel(THRESHOLD_COARSE_STEP)}`,
              fr.alertRaise(stepLabel(THRESHOLD_COARSE_STEP)),
            )}
          </View>
          {isAlreadyReached(threshold, station.price) && (
            <AppText variant="caption" tone="warning">
              {fr.alertAlreadyReached}
            </AppText>
          )}
        </View>

        {actionError === 'too-many' && <Banner tone="warning" message={fr.alertTooMany} />}
        {actionError === 'failed' && <Banner tone="danger" message={fr.alertFailed} />}

        <Button
          label={existing ? fr.alertUpdate : fr.alertCreate}
          onPress={() => void submit()}
          disabled={busy}
          variant={existing && unchanged ? 'secondary' : 'primary'}
        />
        {existing && (
          <Button
            label={fr.alertRemove}
            variant="secondary"
            onPress={() => void remove(existing.id)}
          />
        )}
        {!ready && (
          <AppText variant="caption" tone="muted">
            {fr.loadingResults}
          </AppText>
        )}
        {pushMessage !== '' && (
          <AppText variant="caption" tone="muted" accessibilityLiveRegion="polite">
            {pushMessage}
          </AppText>
        )}
      </View>
    </View>
  )
}
