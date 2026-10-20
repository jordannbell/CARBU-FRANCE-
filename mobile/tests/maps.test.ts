import { describe, expect, it } from 'vitest'
import { buildDirectionsUrl } from '../src/maps'

describe('buildDirectionsUrl', () => {
  it('opens Apple Maps directions on iOS', () => {
    expect(buildDirectionsUrl('ios', 48.85, 2.35, 'Station')).toBe(
      'https://maps.apple.com/?daddr=48.85,2.35&dirflg=d',
    )
  })

  it('uses a geo: intent on Android with an encoded label', () => {
    expect(buildDirectionsUrl('android', 48.85, 2.35, '12 rue de la Paix & Co')).toBe(
      'geo:48.85,2.35?q=48.85,2.35(12%20rue%20de%20la%20Paix%20%26%20Co)',
    )
  })
})
