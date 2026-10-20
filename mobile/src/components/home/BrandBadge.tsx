import { StyleSheet, View } from 'react-native'
import { brandMonogram, BRAND_GROUP_COLORS, type BrandGroup } from '../../logic/brandStyle'
import { AppText } from '../ui'

const BADGE_SIZE = 26

/**
 * Own-made badge for a brand: a coloured disc (by group) with a monogram. Real logos are
 * trademarks and are not used. The group colour is never the only information: the monogram and
 * the brand name (accessibility label of the row or marker) carry it too.
 */
export function BrandBadge({
  brand,
  group,
  size = BADGE_SIZE,
}: {
  brand: string
  group: BrandGroup
  size?: number
}) {
  return (
    <View
      accessible={false}
      style={[
        styles.badge,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: BRAND_GROUP_COLORS[group],
        },
      ]}
    >
      <AppText variant="caption" style={styles.letters}>
        {brandMonogram(brand)}
      </AppText>
    </View>
  )
}

const styles = StyleSheet.create({
  badge: { alignItems: 'center', justifyContent: 'center' },
  letters: { color: '#FFFFFF', fontWeight: '700', fontSize: 11, lineHeight: 13 },
})
