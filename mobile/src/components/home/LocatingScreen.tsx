import { ActivityIndicator, StyleSheet, View } from 'react-native'
import { useColors } from '../../theme/ThemeProvider'
import { spacing } from '../../theme/tokens'
import { AppText } from '../ui'

/** Shown for the moment it takes to know where to open the map. */
export function LocatingScreen({ label }: { label: string }) {
  const colors = useColors()
  return (
    <View style={styles.center} accessibilityLiveRegion="polite">
      <ActivityIndicator color={colors.primary} />
      <AppText tone="muted">{label}</AppText>
    </View>
  )
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md },
})
