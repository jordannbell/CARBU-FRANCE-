const EARTH_RADIUS_KM = 6371
const KM_PER_DEGREE_LATITUDE = 111.32

export interface Point {
  readonly latitude: number
  readonly longitude: number
}

export interface BoundingBox {
  readonly minLatitude: number
  readonly maxLatitude: number
  readonly minLongitude: number
  readonly maxLongitude: number
}

const toRadians = (degrees: number): number => (degrees * Math.PI) / 180

export function haversineKm(a: Point, b: Point): number {
  const dLat = toRadians(b.latitude - a.latitude)
  const dLon = toRadians(b.longitude - a.longitude)
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(a.latitude)) * Math.cos(toRadians(b.latitude)) * Math.sin(dLon / 2) ** 2
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)))
}

export const boxCenter = (box: BoundingBox): Point => ({
  latitude: (box.minLatitude + box.maxLatitude) / 2,
  longitude: (box.minLongitude + box.maxLongitude) / 2,
})

export const boxContains = (box: BoundingBox, point: Point): boolean =>
  point.latitude >= box.minLatitude &&
  point.latitude <= box.maxLatitude &&
  point.longitude >= box.minLongitude &&
  point.longitude <= box.maxLongitude

/** Distance from the centre of the box to its corner: the radius of the circle that contains it. */
export const boxHalfDiagonalKm = (box: BoundingBox): number =>
  haversineKm(boxCenter(box), { latitude: box.maxLatitude, longitude: box.maxLongitude })

/** Grows the box outward to a grid, so near-identical map views share one cache entry. */
export function snapBoxOutward(box: BoundingBox): BoundingBox {
  const span = Math.max(box.maxLatitude - box.minLatitude, box.maxLongitude - box.minLongitude)
  const step = span >= 0.2 ? 0.02 : span >= 0.05 ? 0.01 : 0.005
  const down = (value: number) => Math.round(Math.floor(value / step + 1e-9) * step * 1e6) / 1e6
  const up = (value: number) => Math.round(Math.ceil(value / step - 1e-9) * step * 1e6) / 1e6
  return {
    minLatitude: down(box.minLatitude),
    maxLatitude: up(box.maxLatitude),
    minLongitude: down(box.minLongitude),
    maxLongitude: up(box.maxLongitude),
  }
}

export function boundingBox(center: Point, radiusKm: number): BoundingBox {
  const latDelta = radiusKm / KM_PER_DEGREE_LATITUDE
  const cosLat = Math.max(Math.cos(toRadians(center.latitude)), 0.01)
  const lonDelta = radiusKm / (KM_PER_DEGREE_LATITUDE * cosLat)
  return {
    minLatitude: center.latitude - latDelta,
    maxLatitude: center.latitude + latDelta,
    minLongitude: center.longitude - lonDelta,
    maxLongitude: center.longitude + lonDelta,
  }
}

const KM_PER_DEGREE = KM_PER_DEGREE_LATITUDE

/** Box around a path, grown by `marginKm` on every side. */
export function pathBounds(path: readonly Point[], marginKm: number): BoundingBox {
  let minLatitude = Infinity
  let maxLatitude = -Infinity
  let minLongitude = Infinity
  let maxLongitude = -Infinity
  for (const point of path) {
    minLatitude = Math.min(minLatitude, point.latitude)
    maxLatitude = Math.max(maxLatitude, point.latitude)
    minLongitude = Math.min(minLongitude, point.longitude)
    maxLongitude = Math.max(maxLongitude, point.longitude)
  }
  const latMargin = marginKm / KM_PER_DEGREE
  const cosLat = Math.max(Math.cos(toRadians((minLatitude + maxLatitude) / 2)), 0.01)
  const lonMargin = marginKm / (KM_PER_DEGREE * cosLat)
  return {
    minLatitude: minLatitude - latMargin,
    maxLatitude: maxLatitude + latMargin,
    minLongitude: minLongitude - lonMargin,
    maxLongitude: maxLongitude + lonMargin,
  }
}

/**
 * Shortest straight distance from a point to a path, in km. Each segment is measured on a plane
 * centred on the point (accurate to a few metres over the few km a corridor covers).
 */
export function distanceToPathKm(point: Point, path: readonly Point[]): number {
  const first = path[0]
  if (!first) return Infinity
  const kmPerDegreeLon = KM_PER_DEGREE * Math.max(Math.cos(toRadians(point.latitude)), 0.01)
  const toXY = (p: Point) => ({
    x: (p.longitude - point.longitude) * kmPerDegreeLon,
    y: (p.latitude - point.latitude) * KM_PER_DEGREE,
  })
  let best = Math.hypot(toXY(first).x, toXY(first).y)
  for (let i = 1; i < path.length; i += 1) {
    const a = toXY(path[i - 1] as Point)
    const b = toXY(path[i] as Point)
    const dx = b.x - a.x
    const dy = b.y - a.y
    const lengthSquared = dx * dx + dy * dy
    const t =
      lengthSquared === 0 ? 0 : Math.max(0, Math.min(1, -(a.x * dx + a.y * dy) / lengthSquared))
    best = Math.min(best, Math.hypot(a.x + t * dx, a.y + t * dy))
  }
  return best
}
