import { describe, expect, it } from 'vitest'
import { boundingBox, haversineKm } from '../src/geo'

const PARIS = { latitude: 48.8566, longitude: 2.3522 }
const LYON = { latitude: 45.764, longitude: 4.8357 }

describe('haversineKm', () => {
  it('returns 0 for identical points', () => {
    expect(haversineKm(PARIS, PARIS)).toBe(0)
  })

  it('computes Paris to Lyon at about 392 km', () => {
    expect(haversineKm(PARIS, LYON)).toBeGreaterThan(388)
    expect(haversineKm(PARIS, LYON)).toBeLessThan(396)
  })
})

describe('boundingBox', () => {
  it('contains every point within the radius', () => {
    const box = boundingBox(PARIS, 10)
    const edge = { latitude: PARIS.latitude + 0.08, longitude: PARIS.longitude }
    expect(haversineKm(PARIS, edge)).toBeLessThan(10)
    expect(edge.latitude).toBeLessThan(box.maxLatitude)
  })

  it('is wider in longitude than in latitude away from the equator', () => {
    const box = boundingBox(PARIS, 10)
    const latSpan = box.maxLatitude - box.minLatitude
    const lonSpan = box.maxLongitude - box.minLongitude
    expect(lonSpan).toBeGreaterThan(latSpan)
  })
})
