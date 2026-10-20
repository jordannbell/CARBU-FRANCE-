import type { MapBounds } from '../api'

export interface Region {
  readonly latitude: number
  readonly longitude: number
  readonly latitudeDelta: number
  readonly longitudeDelta: number
}

// The API refuses a box wider than 50 km from centre to corner; stay under with some margin.
const MAX_HALF_DIAGONAL_KM = 45
const KM_PER_DEGREE = 111.32
const MAX_LATITUDE = 90
const MAX_LONGITUDE = 180

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value))

export interface ViewArea {
  readonly bounds: MapBounds
  /** True when the view was larger than a search allows and the box was shrunk around its centre. */
  readonly clamped: boolean
}

/** Half the diagonal of a box, in km, with the east-west distance shortened by the latitude. */
function halfDiagonalKm(latitude: number, latitudeDelta: number, longitudeDelta: number): number {
  const north = (latitudeDelta / 2) * KM_PER_DEGREE
  const east = (longitudeDelta / 2) * KM_PER_DEGREE * Math.cos((latitude * Math.PI) / 180)
  return Math.hypot(north, east)
}

/** The box a search should cover for what the map shows. */
export function regionToArea(region: Region): ViewArea {
  const size = halfDiagonalKm(region.latitude, region.latitudeDelta, region.longitudeDelta)
  const factor = size > MAX_HALF_DIAGONAL_KM ? MAX_HALF_DIAGONAL_KM / size : 1
  const latHalf = (Math.abs(region.latitudeDelta) * factor) / 2
  const lonHalf = (Math.abs(region.longitudeDelta) * factor) / 2
  return {
    clamped: factor < 1,
    bounds: {
      minLatitude: clamp(region.latitude - latHalf, -MAX_LATITUDE, MAX_LATITUDE),
      maxLatitude: clamp(region.latitude + latHalf, -MAX_LATITUDE, MAX_LATITUDE),
      minLongitude: clamp(region.longitude - lonHalf, -MAX_LONGITUDE, MAX_LONGITUDE),
      maxLongitude: clamp(region.longitude + lonHalf, -MAX_LONGITUDE, MAX_LONGITUDE),
    },
  }
}

/** A region centred on a point, wide enough to see roughly `radiusKm` around it. */
export function regionAround(
  point: { latitude: number; longitude: number },
  radiusKm: number,
): Region {
  const latitudeDelta = (2 * radiusKm) / KM_PER_DEGREE
  const cos = Math.max(Math.cos((point.latitude * Math.PI) / 180), 0.01)
  return { ...point, latitudeDelta, longitudeDelta: latitudeDelta / cos }
}
