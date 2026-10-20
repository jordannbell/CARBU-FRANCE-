import { describe, expect, it } from 'vitest'
import type { StationResult } from '../src/contract'
import { formatDistance, formatPrice, formatUpdatedAt, pickCheapestId } from '../src/format'

const station = (overrides: Partial<StationResult> & Pick<StationResult, 'id' | 'price'>) =>
  ({
    brand: null,
    brandGroup: null,
    address: 'a',
    city: 'Paris',
    postalCode: '75001',
    latitude: 48.8,
    longitude: 2.3,
    open24h: false,
    services: [],
    fuel: 'gazole',
    updatedAt: '2026-10-17T08:00:00Z',
    stale: false,
    shortage: null,
    distanceKm: 1,
    ...overrides,
  }) satisfies StationResult

describe('formatPrice', () => {
  it('uses a comma and three decimals', () => {
    expect(formatPrice(1.789)).toBe('1,789 €')
    expect(formatPrice(2)).toBe('2,000 €')
  })
})

describe('formatDistance', () => {
  it.each([
    [0.35, '350 m'],
    [0.999, '999 m'],
    [1, '1,0 km'],
    [12.34, '12,3 km'],
  ])('formats %s km as %s', (km, expected) => {
    expect(formatDistance(km)).toBe(expected)
  })
})

describe('formatUpdatedAt', () => {
  it('does not show "Invalid Date" for an unreadable value', () => {
    expect(formatUpdatedAt('garbage')).toBe('date inconnue')
  })

  it('formats a valid date', () => {
    expect(formatUpdatedAt('2026-10-17T08:00:00Z')).toMatch(/17\/10/)
  })
})

describe('pickCheapestId', () => {
  it('returns undefined for an empty list', () => {
    expect(pickCheapestId([])).toBeUndefined()
  })

  it('picks the lowest price', () => {
    expect(pickCheapestId([station({ id: 1, price: 1.9 }), station({ id: 2, price: 1.7 })])).toBe(2)
  })

  it('never recommends a stale or shortage station', () => {
    const list = [
      station({ id: 1, price: 1.1, stale: true }),
      station({
        id: 2,
        price: 1.2,
        shortage: { type: 'temporaire', since: '2026-10-15T00:00:00Z' },
      }),
      station({ id: 3, price: 1.9 }),
    ]
    expect(pickCheapestId(list)).toBe(3)
  })

  it('returns undefined when nothing is recommendable', () => {
    expect(pickCheapestId([station({ id: 1, price: 1.1, stale: true })])).toBeUndefined()
  })
})
