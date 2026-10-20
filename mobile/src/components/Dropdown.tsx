import { useMemo, useState, type ReactNode } from 'react'
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { home } from '../i18n/home'
import { useColors } from '../theme/ThemeProvider'
import { MIN_TOUCH_TARGET, radius, spacing, type ColorTokens } from '../theme/tokens'
import { AppText } from './ui'

const MENU_MAX_HEIGHT = 420

const makeStyles = (colors: ColorTokens) =>
  StyleSheet.create({
    trigger: {
      flex: 1,
      minHeight: MIN_TOUCH_TARGET,
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      paddingHorizontal: spacing.md,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
    },
    triggerText: { flex: 1 },
    backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' },
    menu: {
      maxHeight: MENU_MAX_HEIGHT,
      marginHorizontal: spacing.lg,
      borderRadius: radius.lg,
      backgroundColor: colors.surface,
      overflow: 'hidden',
    },
    title: { padding: spacing.lg, paddingBottom: spacing.sm },
    option: {
      minHeight: MIN_TOUCH_TARGET,
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.sm,
    },
    check: { width: 24, textAlign: 'center' },
  })

/**
 * A button that opens a menu in front of the screen. A touch outside the menu, the back button or
 * the "Fermer" action closes it. The menu content is given as `children`, usually `DropdownOption`s.
 */
export function Dropdown({
  label,
  valueLabel,
  leading,
  children,
}: {
  /** Name of the menu, read by screen readers and shown as the menu title. */
  label: string
  /** What is currently chosen, shown in the button. */
  valueLabel: string
  leading?: ReactNode
  /** Receives `close` so a single-choice menu can close itself after a choice. */
  children: (close: () => void) => ReactNode
}) {
  const colors = useColors()
  const insets = useSafeAreaInsets()
  const styles = useMemo(() => makeStyles(colors), [colors])
  const [open, setOpen] = useState(false)
  const close = () => setOpen(false)

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label} : ${valueLabel}`}
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen(true)}
        style={({ pressed }) => [
          styles.trigger,
          pressed && { backgroundColor: colors.surfaceMuted },
        ]}
      >
        {leading}
        <AppText variant="label" numberOfLines={1} style={styles.triggerText}>
          {valueLabel}
        </AppText>
        <AppText variant="caption" tone="muted" accessibilityElementsHidden>
          ▾
        </AppText>
      </Pressable>
      <Modal visible={open} transparent animationType="fade" onRequestClose={close}>
        <Pressable
          accessibilityLabel={home.menuClose}
          accessibilityRole="button"
          onPress={close}
          style={[styles.backdrop, { paddingBottom: insets.bottom + spacing.lg }]}
        >
          {/* A touch on the menu itself must not reach the backdrop. */}
          <Pressable accessible={false} style={styles.menu}>
            <AppText variant="bodyStrong" accessibilityRole="header" style={styles.title}>
              {label}
            </AppText>
            <ScrollView>{children(close)}</ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  )
}

/** One row of a `Dropdown` menu. `multiple` makes it a check box instead of a radio button. */
export function DropdownOption({
  label,
  selected,
  onPress,
  multiple = false,
  leading,
}: {
  label: string
  selected: boolean
  onPress: () => void
  multiple?: boolean
  leading?: ReactNode
}) {
  const colors = useColors()
  const styles = useMemo(() => makeStyles(colors), [colors])
  return (
    <Pressable
      accessibilityRole={multiple ? 'checkbox' : 'radio'}
      accessibilityLabel={label}
      accessibilityState={{ checked: selected }}
      onPress={onPress}
      style={({ pressed }) => [styles.option, pressed && { backgroundColor: colors.surfaceMuted }]}
    >
      <AppText variant="label" style={styles.check}>
        {selected ? '✓' : ''}
      </AppText>
      {leading}
      <View style={{ flex: 1 }}>
        <AppText variant={selected ? 'bodyStrong' : 'body'}>{label}</AppText>
      </View>
    </Pressable>
  )
}
