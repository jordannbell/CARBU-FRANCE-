import { groupOf } from './brands/normalize'
import { isStale, type NearbyStation } from './domain'
import { roundTo } from './http'

/** The public shape of one search result. Mirrors `stationResultSchema` in the mobile contract. */
export function toStationResult(entry: NearbyStation, now: Date) {
  return {
    id: entry.station.id,
    brand: entry.station.brand,
    brandGroup: entry.station.brand ? groupOf(entry.station.brand) : null,
    address: entry.station.address,
    city: entry.station.city,
    postalCode: entry.station.postalCode,
    latitude: entry.station.latitude,
    longitude: entry.station.longitude,
    open24h: entry.station.open24h,
    services: entry.station.services,
    fuel: entry.price.fuel,
    price: entry.price.price,
    updatedAt: entry.price.updatedAt,
    stale: isStale(entry.price.updatedAt, now),
    shortage: entry.shortage ? { type: entry.shortage.type, since: entry.shortage.since } : null,
    distanceKm: roundTo(entry.distanceKm, 2),
  }
}
