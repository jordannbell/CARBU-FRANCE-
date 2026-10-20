import type { LatLon } from './types'

// ~9 m in latitude: invisible on a phone map, but cuts a route from thousands of points to tens.
export const DEFAULT_TOLERANCE_DEGREES = 0.00008

function squaredDistanceToSegment(point: LatLon, start: LatLon, end: LatLon): number {
  const dx = end.longitude - start.longitude
  const dy = end.latitude - start.latitude
  const lengthSquared = dx * dx + dy * dy
  const t =
    lengthSquared === 0
      ? 0
      : Math.max(
          0,
          Math.min(
            1,
            ((point.longitude - start.longitude) * dx + (point.latitude - start.latitude) * dy) /
              lengthSquared,
          ),
        )
  const projectionX = start.longitude + t * dx
  const projectionY = start.latitude + t * dy
  return (point.longitude - projectionX) ** 2 + (point.latitude - projectionY) ** 2
}

/** Ramer-Douglas-Peucker simplification, iterative so long routes cannot overflow the stack. */
export function simplifyPath(
  path: readonly LatLon[],
  tolerance: number = DEFAULT_TOLERANCE_DEGREES,
): readonly LatLon[] {
  if (path.length <= 2) return path

  const keep = new Array<boolean>(path.length).fill(false)
  keep[0] = true
  keep[path.length - 1] = true
  const toleranceSquared = tolerance * tolerance
  const stack: [number, number][] = [[0, path.length - 1]]

  for (let range = stack.pop(); range; range = stack.pop()) {
    const [first, last] = range
    let farthestIndex = -1
    let farthest = toleranceSquared
    const start = path[first]
    const end = path[last]
    if (!start || !end) continue

    for (let i = first + 1; i < last; i += 1) {
      const point = path[i]
      if (!point) continue
      const distance = squaredDistanceToSegment(point, start, end)
      if (distance > farthest) {
        farthest = distance
        farthestIndex = i
      }
    }
    if (farthestIndex !== -1) {
      keep[farthestIndex] = true
      stack.push([first, farthestIndex], [farthestIndex, last])
    }
  }

  return path.filter((_, index) => keep[index])
}
