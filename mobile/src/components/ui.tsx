import { useMemo } from 'react'
import { Pressable, StyleSheet, Text, View, type TextProps } from 'react-native'
import { useColors } from '../theme/ThemeProvider'
import {
  MIN_TOUCH_TARGET,
  radius,
  spacing,
  typography,
  type ColorTokens,
  type TypeRole,
} from '../theme/tokens'

/** The only way to render text: applies the type role and the themed color. Font scaling stays on. */
export function AppText({
  variant = 'body',
  tone = 'default',
  style,
  ...rest
}: TextProps & {
  variant?: TypeRole
  tone?: 'default' | 'muted' | 'success' | 'warning' | 'danger' | 'inverse'
}) {
  const colors = useColors()
  const color = {
    default: colors.text,
    muted: colors.textMuted,
    success: colors.success,
    warning: colors.warning,
    danger: colors.danger,
    inverse: colors.primaryText,
  }[tone]
  return <Text style={[typography[variant], { color }, style]} {...rest} />
}

const makeChipStyles = (colors: ColorTokens) =>
  StyleSheet.create({
    chip: {
      minHeight: MIN_TOUCH_TARGET,
      paddingHorizontal: spacing.lg,
      justifyContent: 'center',
      borderRadius: radius.pill,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
    },
    selected: { backgroundColor: colors.primary, borderColor: colors.primary },
  })

/** A single-choice pill (used in a horizontal list of options, like the fuel type). */
export function Chip({
  label,
  selected,
  onPress,
  multiple = false,
}: {
  label: string
  selected: boolean
  onPress: () => void
  /** Several chips of the group can be selected at once. */
  multiple?: boolean
}) {
  const colors = useColors()
  const styles = useMemo(() => makeChipStyles(colors), [colors])
  return (
    <Pressable
      accessibilityRole={multiple ? 'checkbox' : 'radio'}
      accessibilityLabel={label}
      accessibilityState={{ checked: selected }}
      onPress={onPress}
      style={[styles.chip, selected && styles.selected]}
    >
      <AppText variant="label" tone={selected ? 'inverse' : 'default'}>
        {label}
      </AppText>
    </Pressable>
  )
}

const makeSegmentedStyles = (colors: ColorTokens) =>
  StyleSheet.create({
    group: {
      flexDirection: 'row',
      padding: spacing.xs,
      borderRadius: radius.md,
      backgroundColor: colors.surfaceMuted,
    },
    segment: {
      flex: 1,
      minHeight: MIN_TOUCH_TARGET,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: radius.sm,
      paddingHorizontal: spacing.md,
    },
    selected: { backgroundColor: colors.surface },
  })

export interface SegmentedOption<T extends string | number> {
  readonly value: T
  readonly label: string
}

/** Compact segmented control for 2 to 4 mutually exclusive options. */
export function Segmented<T extends string | number>({
  label,
  options,
  value,
  onChange,
}: {
  label: string
  options: readonly SegmentedOption<T>[]
  value: T
  onChange: (value: T) => void
}) {
  const colors = useColors()
  const styles = useMemo(() => makeSegmentedStyles(colors), [colors])
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={label} style={styles.group}>
      {options.map((option) => {
        const selected = option.value === value
        return (
          <Pressable
            key={String(option.value)}
            accessibilityRole="radio"
            accessibilityLabel={option.label}
            accessibilityState={{ checked: selected }}
            onPress={() => onChange(option.value)}
            style={[styles.segment, selected && styles.selected]}
          >
            <AppText variant="label" tone={selected ? 'default' : 'muted'}>
              {option.label}
            </AppText>
          </Pressable>
        )
      })}
    </View>
  )
}

export function Button({
  label,
  onPress,
  variant = 'primary',
  disabled = false,
}: {
  label: string
  onPress: () => void
  variant?: 'primary' | 'secondary' | 'danger'
  disabled?: boolean
}) {
  const colors = useColors()
  const primary = variant === 'primary'
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: MIN_TOUCH_TARGET,
        paddingHorizontal: spacing.xl,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: radius.pill,
        borderWidth: primary ? 0 : 1,
        borderColor: variant === 'danger' ? colors.danger : colors.border,
        backgroundColor: primary ? colors.primary : colors.surface,
        opacity: disabled ? 0.5 : pressed ? 0.7 : 1,
      })}
    >
      <AppText
        variant="label"
        tone={primary ? 'inverse' : variant === 'danger' ? 'danger' : 'default'}
      >
        {label}
      </AppText>
    </Pressable>
  )
}

/** Non-blocking message at the top of the content, with an optional single recovery action. */
export function Banner({
  tone,
  message,
  actionLabel,
  onAction,
}: {
  tone: 'warning' | 'danger'
  message: string
  actionLabel?: string
  onAction?: () => void
}) {
  const colors = useColors()
  const background = tone === 'warning' ? colors.warningSurface : colors.dangerSurface
  return (
    <View
      accessibilityLiveRegion="polite"
      style={{
        marginTop: spacing.md,
        padding: spacing.md,
        borderRadius: radius.md,
        backgroundColor: background,
        gap: spacing.xs,
      }}
    >
      <AppText variant="label" tone={tone}>
        {message}
      </AppText>
      {actionLabel && onAction && (
        <Pressable
          accessibilityRole="button"
          onPress={onAction}
          style={{ minHeight: MIN_TOUCH_TARGET, justifyContent: 'center' }}
        >
          <AppText variant="label" tone={tone} style={{ textDecorationLine: 'underline' }}>
            {actionLabel}
          </AppText>
        </Pressable>
      )}
    </View>
  )
}
