import { useMemo } from 'react'
import { Modal, ScrollView, StyleSheet, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { fr } from '../i18n/fr'
import { findUnfilled, getDocument, LEGAL_UPDATED_AT, type LegalKind } from '../legal/render'
import { useColors } from '../theme/ThemeProvider'
import { spacing, type ColorTokens } from '../theme/tokens'
import { AppText, Banner, Button } from './ui'

const makeStyles = (colors: ColorTokens) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.background },
    content: { padding: spacing.xl, gap: spacing.md },
    close: { alignSelf: 'flex-end' },
    list: { gap: spacing.xs, paddingLeft: spacing.md },
  })

/** Shows the privacy policy or the legal notice. Same source as PRIVACY.md and LEGAL.md. */
export function LegalModal({
  kind,
  visible,
  onClose,
}: {
  kind: LegalKind
  visible: boolean
  onClose: () => void
}) {
  const colors = useColors()
  const styles = useMemo(() => makeStyles(colors), [colors])
  const insets = useSafeAreaInsets()
  const doc = useMemo(() => getDocument(kind), [kind])
  // Only developers see this: published builds must pass `npm run legal:check` first.
  const incomplete = __DEV__ && findUnfilled(doc).length > 0

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={[styles.screen, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.close}>
            <Button label={fr.close} variant="secondary" onPress={onClose} />
          </View>
          <AppText variant="title" accessibilityRole="header">
            {doc.title}
          </AppText>
          <AppText variant="caption" tone="muted">
            {fr.legalUpdated(LEGAL_UPDATED_AT)}
          </AppText>
          {incomplete && <Banner tone="warning" message={fr.legalIncomplete} />}
          <AppText>{doc.intro}</AppText>
          {doc.sections.map((section) => (
            <View key={section.title} style={{ gap: spacing.sm }}>
              <AppText variant="bodyStrong" accessibilityRole="header">
                {section.title}
              </AppText>
              {section.body?.map((paragraph) => (
                <AppText key={paragraph} tone="muted">
                  {paragraph}
                </AppText>
              ))}
              {section.list && (
                <View style={styles.list}>
                  {section.list.map((item) => (
                    <AppText key={item} tone="muted">
                      {`• ${item}`}
                    </AppText>
                  ))}
                </View>
              )}
            </View>
          ))}
        </ScrollView>
      </View>
    </Modal>
  )
}
