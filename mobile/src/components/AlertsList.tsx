import { useMemo } from 'react'
import { Pressable, StyleSheet, View } from 'react-native'
import { formatPrice } from '../format'
import { fr, fuelLabels } from '../i18n/fr'
import { useAlerts } from '../state/Alerts'
import { useColors } from '../theme/ThemeProvider'
import { MIN_TOUCH_TARGET, radius, spacing, type ColorTokens } from '../theme/tokens'
import { AppText, Banner } from './ui'

const makeStyles = (colors: ColorTokens) =>
  StyleSheet.create({
    card: {
      backgroundColor: colors.surface,
      borderRadius: radius.lg,
      paddingHorizontal: spacing.lg,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      paddingVertical: spacing.md,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    last: { borderBottomWidth: 0 },
    remove: { minHeight: MIN_TOUCH_TARGET, minWidth: MIN_TOUCH_TARGET, justifyContent: 'center' },
  })

/** The device's price alerts, with the way to delete each one. */
export function AlertsList() {
  const colors = useColors()
  const styles = useMemo(() => makeStyles(colors), [colors])
  const { alerts, loadFailed, reload, remove, pushStatus, actionError } = useAlerts()

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
    <View style={{ gap: spacing.sm }}>
      <AppText variant="bodyStrong" accessibilityRole="header">
        {fr.alertsTitle}
      </AppText>
      {loadFailed && (
        <Banner
          tone="warning"
          message={fr.alertsLoadFailed}
          actionLabel={fr.retry}
          onAction={reload}
        />
      )}
      {actionError === 'failed' && <Banner tone="danger" message={fr.alertFailed} />}
      {alerts.length === 0 && !loadFailed ? (
        <AppText tone="muted">{fr.alertsEmpty}</AppText>
      ) : (
        <View style={styles.card}>
          {alerts.map((alert, index) => {
            const title = alert.address ?? fr.alertStationUnknown
            const fired =
              alert.triggeredAt !== null &&
              alert.currentPrice !== null &&
              alert.currentPrice <= alert.threshold
            const detail = fr.alertRow({
              fuel: fuelLabels[alert.fuel],
              threshold: formatPrice(alert.threshold),
              current: alert.currentPrice !== null ? formatPrice(alert.currentPrice) : null,
            })
            return (
              <View key={alert.id} style={[styles.row, index === alerts.length - 1 && styles.last]}>
                <View
                  style={{ flex: 1 }}
                  accessible
                  accessibilityLabel={`${title}, ${detail}${fired ? `, ${fr.alertTriggered(formatPrice(alert.currentPrice ?? 0))}` : ''}`}
                >
                  <AppText variant="bodyStrong" numberOfLines={2}>
                    {title}
                  </AppText>
                  <AppText variant="caption" tone="muted">
                    {detail}
                  </AppText>
                  {fired && (
                    <AppText variant="caption" tone="success">
                      {fr.alertTriggered(formatPrice(alert.currentPrice ?? 0))}
                    </AppText>
                  )}
                </View>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`${fr.alertRemove} : ${title}`}
                  onPress={() => void remove(alert.id)}
                  style={styles.remove}
                >
                  <AppText variant="label" tone="danger">
                    {fr.alertRemove}
                  </AppText>
                </Pressable>
              </View>
            )
          })}
        </View>
      )}
      {pushMessage !== '' && (
        <AppText variant="caption" tone="muted">
          {pushMessage}
        </AppText>
      )}
    </View>
  )
}
