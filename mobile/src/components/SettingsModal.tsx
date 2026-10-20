import { useMemo, useState } from 'react'
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { fr } from '../i18n/fr'
import { TANK_MAX_LITERS, TANK_MIN_LITERS, TANK_STEP_LITERS, clampTank } from '../logic/settings'
import type { LegalKind } from '../legal/render'
import { DONATION_URL, openHttps } from '../links'
import { useAlerts } from '../state/Alerts'
import { useAppState } from '../state/AppState'
import { useColors } from '../theme/ThemeProvider'
import { MIN_TOUCH_TARGET, radius, spacing, type ColorTokens } from '../theme/tokens'
import { AlertsList } from './AlertsList'
import { LegalModal } from './LegalModal'
import { AppText, Banner, Button } from './ui'

const makeStyles = (colors: ColorTokens) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.background },
    content: { padding: spacing.xl, gap: spacing.lg },
    close: { alignSelf: 'flex-end' },
    card: {
      backgroundColor: colors.surface,
      borderRadius: radius.lg,
      padding: spacing.lg,
      gap: spacing.sm,
    },
    stepper: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    stepButton: {
      minHeight: MIN_TOUCH_TARGET,
      minWidth: MIN_TOUCH_TARGET,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: radius.pill,
      backgroundColor: colors.surfaceMuted,
    },
    switchRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  })

export function SettingsModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const colors = useColors()
  const styles = useMemo(() => makeStyles(colors), [colors])
  const insets = useSafeAreaInsets()
  const { settings, updateSettings, saveFailed } = useAppState()
  const { forgetMe, actionError } = useAlerts()
  const [legal, setLegal] = useState<LegalKind | null>(null)
  const [forgetDone, setForgetDone] = useState(false)
  const [supportFailed, setSupportFailed] = useState(false)
  const [forgetting, setForgetting] = useState(false)

  const confirmForget = () => {
    setForgetDone(false)
    Alert.alert(fr.forgetConfirmTitle, fr.forgetConfirmBody, [
      { text: fr.cancel, style: 'cancel' },
      {
        text: fr.forgetConfirmAction,
        style: 'destructive',
        onPress: () => {
          setForgetting(true)
          void forgetMe().then((done) => {
            setForgetDone(done)
            setForgetting(false)
          })
        },
      },
    ])
  }

  const openSupport = () => {
    if (!DONATION_URL) return
    setSupportFailed(false)
    void openHttps(DONATION_URL).then((opened) => setSupportFailed(!opened))
  }

  const step = (delta: number) =>
    updateSettings({ tankLiters: clampTank(settings.tankLiters + delta) })

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={[styles.screen, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.close}>
            <Button label={fr.close} variant="secondary" onPress={onClose} />
          </View>
          <AppText variant="title" accessibilityRole="header">
            {fr.settingsTitle}
          </AppText>
          {saveFailed && <Banner tone="warning" message={fr.saveFailed} />}

          <View style={styles.card}>
            <AppText variant="bodyStrong" accessibilityRole="header">
              {fr.tankTitle}
            </AppText>
            <View style={styles.stepper}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={fr.tankDecrease}
                disabled={settings.tankLiters <= TANK_MIN_LITERS}
                onPress={() => step(-TANK_STEP_LITERS)}
                style={[
                  styles.stepButton,
                  settings.tankLiters <= TANK_MIN_LITERS && { opacity: 0.4 },
                ]}
              >
                <AppText variant="bodyStrong">−</AppText>
              </Pressable>
              <AppText variant="price" accessibilityLiveRegion="polite">
                {fr.tankValue(settings.tankLiters)}
              </AppText>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={fr.tankIncrease}
                disabled={settings.tankLiters >= TANK_MAX_LITERS}
                onPress={() => step(TANK_STEP_LITERS)}
                style={[
                  styles.stepButton,
                  settings.tankLiters >= TANK_MAX_LITERS && { opacity: 0.4 },
                ]}
              >
                <AppText variant="bodyStrong">+</AppText>
              </Pressable>
            </View>
            <AppText variant="caption" tone="muted">
              {fr.tankHelp}
            </AppText>
          </View>

          <View style={styles.card}>
            <View style={styles.switchRow}>
              <View style={{ flex: 1 }}>
                <AppText variant="bodyStrong">{fr.hideStaleTitle}</AppText>
                <AppText variant="caption" tone="muted">
                  {fr.hideStaleHelp}
                </AppText>
              </View>
              <Switch
                accessibilityLabel={fr.hideStaleTitle}
                value={settings.hideStalePrices}
                onValueChange={(value) => updateSettings({ hideStalePrices: value })}
                trackColor={{ true: colors.primary, false: colors.surfaceMuted }}
              />
            </View>
          </View>

          <AlertsList />

          <AppText variant="bodyStrong" accessibilityRole="header">
            {fr.aboutTitle}
          </AppText>
          <AppText variant="bodyStrong" accessibilityRole="header">
            {fr.aboutDataTitle}
          </AppText>
          <AppText tone="muted">{fr.aboutData}</AppText>
          <AppText variant="bodyStrong" accessibilityRole="header">
            {fr.aboutPrivacyTitle}
          </AppText>
          <AppText tone="muted">{fr.aboutPrivacy}</AppText>
          <AppText variant="caption" tone="muted">
            {fr.credit}
          </AppText>

          <View style={styles.card}>
            <AppText variant="bodyStrong" accessibilityRole="header">
              {fr.dataSection}
            </AppText>
            <Button
              label={fr.privacyLink}
              variant="secondary"
              onPress={() => setLegal('privacy')}
            />
            <Button
              label={fr.legalNoticeLink}
              variant="secondary"
              onPress={() => setLegal('legalNotice')}
            />
            <Button
              label={fr.forgetTitle}
              variant="danger"
              disabled={forgetting}
              onPress={confirmForget}
            />
            <AppText variant="caption" tone="muted">
              {fr.forgetHelp}
            </AppText>
            {actionError === 'forget-failed' && <Banner tone="danger" message={fr.forgetFailed} />}
            {forgetDone && (
              <AppText tone="success" accessibilityLiveRegion="polite">
                {fr.forgetDone}
              </AppText>
            )}
          </View>

          {DONATION_URL && (
            <View style={styles.card}>
              <AppText variant="bodyStrong" accessibilityRole="header">
                {fr.supportTitle}
              </AppText>
              <AppText variant="caption" tone="muted">
                {fr.supportHelp}
              </AppText>
              <Button label={fr.supportTitle} variant="secondary" onPress={openSupport} />
              {supportFailed && <Banner tone="danger" message={fr.supportOpenFailed} />}
            </View>
          )}
        </ScrollView>
      </View>
      {legal && <LegalModal kind={legal} visible onClose={() => setLegal(null)} />}
    </Modal>
  )
}
