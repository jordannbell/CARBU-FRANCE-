import type { PriceHistory } from '../contract'

export interface HistorySummary {
  readonly min: number
  readonly max: number
  readonly first: number
  readonly last: number
  /** Change over the window in euros per litre (last - first). */
  readonly change: number
}

export function summarizeHistory(points: PriceHistory['points']): HistorySummary | null {
  const first = points[0]
  const last = points[points.length - 1]
  if (!first || !last) return null
  const prices = points.map((point) => point.price)
  return {
    min: Math.min(...prices),
    max: Math.max(...prices),
    first: first.price,
    last: last.price,
    change: Math.round((last.price - first.price) * 1000) / 1000,
  }
}

export interface ChartPoint {
  readonly x: number
  readonly y: number
}

const PAD_RATIO = 0.1
const FLAT_PAD_EUR = 0.05

/**
 * Step-line geometry for a price series: a price holds until the next change.
 * The window runs from `windowStartMs` to `windowEndMs` so a flat series still spans the chart.
 */
export function buildStepLine(
  points: PriceHistory['points'],
  windowStartMs: number,
  windowEndMs: number,
  width: number,
  height: number,
): readonly ChartPoint[] {
  const summary = summarizeHistory(points)
  if (!summary || windowEndMs <= windowStartMs) return []

  const span = summary.max - summary.min
  const pad = span === 0 ? FLAT_PAD_EUR : span * PAD_RATIO
  const low = summary.min - pad
  const high = summary.max + pad
  const x = (ms: number) =>
    ((Math.min(Math.max(ms, windowStartMs), windowEndMs) - windowStartMs) /
      (windowEndMs - windowStartMs)) *
    width
  const y = (price: number) => height - ((price - low) / (high - low)) * height

  const line: ChartPoint[] = []
  points.forEach((point, index) => {
    const at = Date.parse(point.at)
    if (Number.isNaN(at)) return
    const previous = points[index - 1]
    if (previous) line.push({ x: x(at), y: y(previous.price) })
    line.push({ x: x(at), y: y(point.price) })
  })
  const last = points[points.length - 1]
  if (last) line.push({ x: width, y: y(last.price) })
  return line
}
