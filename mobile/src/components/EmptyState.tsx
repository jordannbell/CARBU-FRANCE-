import { View } from 'react-native'
import { spacing } from '../theme/tokens'
import { AppText, Button } from './ui'

/** Shared layout for empty and error screens: a short title, one sentence, one next action. */
export function EmptyState({
  title,
  body,
  actionLabel,
  onAction,
}: {
  title: string
  body: string
  actionLabel?: string
  onAction?: () => void
}) {
  return (
    <View
      accessibilityLiveRegion="polite"
      style={{ alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xxl }}
    >
      <AppText variant="bodyStrong" style={{ textAlign: 'center' }} accessibilityRole="header">
        {title}
      </AppText>
      <AppText tone="muted" style={{ textAlign: 'center' }}>
        {body}
      </AppText>
      {actionLabel && onAction && (
        <View style={{ marginTop: spacing.md }}>
          <Button label={actionLabel} onPress={onAction} />
        </View>
      )}
    </View>
  )
}
