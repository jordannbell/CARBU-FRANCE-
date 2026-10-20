import { useMemo, useState } from 'react'
import { View, type LayoutChangeEvent } from 'react-native'
import Svg, { Circle, Line, Path } from 'react-native-svg'
import type { PriceHistory } from '../contract'
import { buildStepLine } from '../logic/history'
import { useColors } from '../theme/ThemeProvider'

const CHART_HEIGHT = 112
const LINE_WIDTH = 2
const MARKER_RADIUS = 4
const SURFACE_RING = 2
const MS_PER_DAY = 86_400_000

/**
 * Single-series step line: a price holds until the station changes it. One hue, thin line,
 * recessive grid, no legend (the section title names the series). The information is repeated
 * as text next to the chart, so the drawing itself is hidden from screen readers.
 */
export function PriceChart({
  points,
  days,
  nowMs,
}: {
  points: PriceHistory['points']
  days: number
  nowMs: number
}) {
  const colors = useColors()
  const [width, setWidth] = useState(0)
  const onLayout = (event: LayoutChangeEvent) =>
    setWidth(Math.round(event.nativeEvent.layout.width))

  const line = useMemo(
    () =>
      width > 0 ? buildStepLine(points, nowMs - days * MS_PER_DAY, nowMs, width, CHART_HEIGHT) : [],
    [points, days, nowMs, width],
  )
  const path = line
    .map((p, index) => `${index === 0 ? 'M' : 'L'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
    .join(' ')
  const end = line[line.length - 1]

  return (
    <View
      onLayout={onLayout}
      style={{ height: CHART_HEIGHT }}
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
    >
      {width > 0 && line.length > 0 && (
        <Svg width={width} height={CHART_HEIGHT}>
          <Line x1={0} y1={0} x2={width} y2={0} stroke={colors.border} strokeWidth={1} />
          <Line
            x1={0}
            y1={CHART_HEIGHT}
            x2={width}
            y2={CHART_HEIGHT}
            stroke={colors.border}
            strokeWidth={1}
          />
          <Path
            d={path}
            stroke={colors.route}
            strokeWidth={LINE_WIDTH}
            strokeLinejoin="round"
            fill="none"
          />
          {end && (
            <Circle
              cx={Math.min(end.x, width - MARKER_RADIUS)}
              cy={end.y}
              r={MARKER_RADIUS}
              fill={colors.route}
              stroke={colors.surface}
              strokeWidth={SURFACE_RING}
            />
          )}
        </Svg>
      )}
    </View>
  )
}
