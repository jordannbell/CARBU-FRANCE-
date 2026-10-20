import { useEffect, useMemo, useRef, useState } from 'react'
import { AccessibilityInfo, Animated, View } from 'react-native'
import { useColors } from '../theme/ThemeProvider'
import { radius, spacing } from '../theme/tokens'
import { makeRowStyles, rowRadius, type RowPosition } from './StationRow'

const SHIMMER_CYCLE_MS = 1_600
const SKELETON_ROWS = 6

function useReduceMotion(): boolean {
  const [reduced, setReduced] = useState(false)
  useEffect(() => {
    let active = true
    AccessibilityInfo.isReduceMotionEnabled()
      .then((value) => {
        if (active) setReduced(value)
      })
      .catch(() => undefined)
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduced)
    return () => {
      active = false
      subscription.remove()
    }
  }, [])
  return reduced
}

/** Placeholder rows with the exact geometry of StationRow, so nothing shifts when data arrives. */
export function StationSkeleton({ loadingLabel }: { loadingLabel: string }) {
  const colors = useColors()
  const rowStyles = useMemo(() => makeRowStyles(colors), [colors])
  const reduceMotion = useReduceMotion()
  const pulse = useRef(new Animated.Value(1)).current

  useEffect(() => {
    if (reduceMotion) {
      pulse.setValue(0.7)
      return undefined
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 0.45,
          duration: SHIMMER_CYCLE_MS / 2,
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 1,
          duration: SHIMMER_CYCLE_MS / 2,
          useNativeDriver: true,
        }),
      ]),
    )
    loop.start()
    return () => loop.stop()
  }, [pulse, reduceMotion])

  const block = (width: `${number}%` | number, height: number) => (
    <Animated.View
      style={{
        width,
        height,
        borderRadius: radius.sm,
        backgroundColor: colors.surfaceMuted,
        opacity: pulse,
      }}
    />
  )

  return (
    <View accessible accessibilityLabel={loadingLabel} accessibilityState={{ busy: true }}>
      {Array.from({ length: SKELETON_ROWS }, (_, index) => {
        const position: RowPosition =
          index === 0 ? 'first' : index === SKELETON_ROWS - 1 ? 'last' : 'middle'
        return (
          <View
            key={index}
            style={[rowStyles.row, rowRadius(position), position !== 'last' && rowStyles.divider]}
          >
            <View style={[rowStyles.body, { gap: spacing.sm }]}>
              {block('70%', 20)}
              {block('45%', 16)}
              {block('30%', 12)}
            </View>
            <View style={rowStyles.priceBlock}>{block(64, 24)}</View>
          </View>
        )
      })}
    </View>
  )
}
