import { useState } from 'react'
import { Modal, ScrollView, StyleSheet, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import type { Place } from '../../contract'
import { fr } from '../../i18n/fr'
import { home } from '../../i18n/home'
import { useColors } from '../../theme/ThemeProvider'
import { spacing } from '../../theme/tokens'
import { PlaceSearch } from '../PlaceSearch'
import { AppText, Button } from '../ui'

/**
 * Asks for a place, then what to do with it: look at the stations around it, or drive there and
 * see the stations along the way.
 */
export function RouteModal({
  visible,
  onClose,
  onAround,
  onRoute,
}: {
  visible: boolean
  onClose: () => void
  onAround: (place: Place) => void
  onRoute: (place: Place) => void
}) {
  const colors = useColors()
  const insets = useSafeAreaInsets()
  const [text, setText] = useState('')
  const [picked, setPicked] = useState<Place | null>(null)

  const finish = (action: (place: Place) => void) => {
    if (!picked) return
    action(picked)
    setPicked(null)
    setText('')
  }
  const close = () => {
    setPicked(null)
    setText('')
    onClose()
  }

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={close}>
      <View
        style={[
          styles.screen,
          { backgroundColor: colors.background, paddingTop: insets.top + spacing.lg },
        ]}
      >
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xl }]}
        >
          <AppText variant="title" accessibilityRole="header">
            {home.routeTitle}
          </AppText>
          <AppText tone="muted">{home.routeBody}</AppText>

          {picked ? (
            <View style={styles.picked}>
              <AppText variant="bodyStrong">{picked.label}</AppText>
              <Button label={home.routeTo} onPress={() => finish(onRoute)} />
              <Button
                label={home.routeAround}
                variant="secondary"
                onPress={() => finish(onAround)}
              />
              <Button label={fr.placeClear} variant="secondary" onPress={() => setPicked(null)} />
            </View>
          ) : (
            <PlaceSearch text={text} onTextChange={setText} onSelect={setPicked} />
          )}
          <Button label={fr.close} variant="secondary" onPress={close} />
        </ScrollView>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { gap: spacing.lg, paddingHorizontal: spacing.lg },
  picked: { gap: spacing.md },
})
