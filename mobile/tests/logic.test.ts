import { describe, expect, it } from 'vitest'
import type { OpeningDay, StationResult } from '../src/contract'
import { parseFavorites, toggleFavorite, MAX_FAVORITES } from '../src/logic/favorites'
import { buildStepLine, summarizeHistory } from '../src/logic/history'
import { openStatus } from '../src/logic/openingHours'
import { computeSavings } from '../src/logic/savings'
import { areaCacheKey, areaKey, findEntry, parseCache, putEntry } from '../src/logic/searchCache'
import { DEFAULT_SETTINGS, clampTank, parseSettings } from '../src/logic/settings'

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

describe('computeSavings', () => {
  it('compares each station with the most expensive usable one, for a full tank', () => {
    const savings = computeSavings(
      [
        station({ id: 1, price: 1.8 }),
        station({ id: 2, price: 2.0 }),
        station({ id: 3, price: 1.9 }),
      ],
      50,
    )
    expect(savings.get(1)).toBe(10) // (2.0 - 1.8) * 50
    expect(savings.get(3)).toBe(5)
    expect(savings.has(2)).toBe(false) // the reference itself saves nothing
  })

  it('ignores stale and out-of-stock stations, both as reference and as target', () => {
    const savings = computeSavings(
      [
        station({ id: 1, price: 1.8 }),
        station({ id: 2, price: 2.5, stale: true }), // would inflate every saving
        station({ id: 3, price: 1.7, shortage: { type: 'temporaire', since: '2026-10-15' } }),
        station({ id: 4, price: 2.0 }),
      ],
      50,
    )
    expect(savings.get(1)).toBe(10)
    expect(savings.has(2)).toBe(false)
    expect(savings.has(3)).toBe(false)
  })

  it('returns nothing when there is nothing to compare or the tank is invalid', () => {
    expect(computeSavings([station({ id: 1, price: 1.8 })], 50).size).toBe(0)
    expect(
      computeSavings([station({ id: 1, price: 1.8 }), station({ id: 2, price: 2 })], 0).size,
    ).toBe(0)
  })

  it('hides trivial savings', () => {
    const savings = computeSavings(
      [station({ id: 1, price: 1.999 }), station({ id: 2, price: 2.0 })],
      50,
    )
    expect(savings.size).toBe(0)
  })
})

describe('openStatus', () => {
  const week = (ranges: [string, string][], closedDays: number[] = []): OpeningDay[] =>
    [1, 2, 3, 4, 5, 6, 7].map((day) =>
      closedDays.includes(day)
        ? { day, closed: true, ranges: [] }
        : { day, closed: false, ranges: ranges.map(([open, close]) => ({ open, close })) },
    )
  // 2026-10-19 is a Monday.
  const at = (day: number, hhmm: string) => {
    const [h = 0, m = 0] = hhmm.split(':').map(Number)
    return new Date(2026, 9, 18 + day, h, m)
  }

  it('is always open for 24/7 stations, even without hours', () => {
    expect(openStatus([], true, at(1, '03:00'))).toEqual({ state: 'always' })
  })

  it('is unknown without hours', () => {
    expect(openStatus([], false, at(1, '12:00'))).toEqual({ state: 'unknown' })
  })

  it('is open inside a range and reports the closing time', () => {
    expect(openStatus(week([['07:30', '21:00']]), false, at(1, '12:00'))).toEqual({
      state: 'open',
      until: '21:00',
    })
  })

  it('is closed before opening and says when it opens', () => {
    expect(openStatus(week([['07:30', '21:00']]), false, at(1, '06:00'))).toEqual({
      state: 'closed',
      opensAt: '07:30',
    })
  })

  it('is closed after closing, with no opening time left today', () => {
    expect(openStatus(week([['07:30', '21:00']]), false, at(1, '22:00'))).toEqual({
      state: 'closed',
      opensAt: null,
    })
  })

  it('is closed on a closed day', () => {
    expect(openStatus(week([['07:30', '21:00']], [7]), false, at(7, '12:00')).state).toBe('closed')
  })

  it('supports a split day', () => {
    const split = week([
      ['08:00', '12:00'],
      ['14:00', '19:00'],
    ])
    expect(openStatus(split, false, at(1, '12:30'))).toEqual({ state: 'closed', opensAt: '14:00' })
    expect(openStatus(split, false, at(1, '15:00')).state).toBe('open')
  })

  it('handles a range that runs past midnight', () => {
    const night = week([['22:00', '06:00']])
    expect(openStatus(night, false, at(1, '23:00')).state).toBe('open')
    expect(openStatus(night, false, at(2, '03:00'))).toEqual({ state: 'open', until: '06:00' })
    expect(openStatus(night, false, at(2, '12:00')).state).toBe('closed')
  })
})

describe('price history', () => {
  const points = [
    { at: '2026-10-01T00:00:00Z', price: 1.9 },
    { at: '2026-10-10T00:00:00Z', price: 2.0 },
    { at: '2026-10-15T00:00:00Z', price: 1.95 },
  ]

  it('summarises min, max and change', () => {
    expect(summarizeHistory(points)).toEqual({
      min: 1.9,
      max: 2.0,
      first: 1.9,
      last: 1.95,
      change: 0.05,
    })
    expect(summarizeHistory([])).toBeNull()
  })

  it('builds a step line that holds each price until the next change', () => {
    const start = Date.parse('2026-10-01T00:00:00Z')
    const end = Date.parse('2026-10-21T00:00:00Z')
    const line = buildStepLine(points, start, end, 200, 100)
    expect(line[0]).toMatchObject({ x: 0 })
    expect(line.at(-1)).toMatchObject({ x: 200 })
    // Every x coordinate stays inside the chart and never goes backwards.
    expect(line.every((p) => p.x >= 0 && p.x <= 200 && p.y >= 0 && p.y <= 100)).toBe(true)
    expect(line.every((p, i) => i === 0 || p.x >= (line[i - 1]?.x ?? 0))).toBe(true)
  })

  it('draws a flat series in the middle of the chart instead of dividing by zero', () => {
    const flat = [{ at: '2026-10-01T00:00:00Z', price: 1.9 }]
    const line = buildStepLine(
      flat,
      Date.parse('2026-10-01T00:00:00Z'),
      Date.parse('2026-10-31T00:00:00Z'),
      100,
      50,
    )
    expect(line.every((p) => Number.isFinite(p.y))).toBe(true)
    expect(line[0]?.y).toBeCloseTo(25)
  })

  it('returns no line for an empty series or an empty window', () => {
    expect(buildStepLine([], 0, 10, 100, 50)).toEqual([])
    expect(buildStepLine(points, 10, 10, 100, 50)).toEqual([])
  })
})

describe('favorites', () => {
  it('toggles, putting the newest first and capping the list', () => {
    expect(toggleFavorite([], 5)).toEqual([5])
    expect(toggleFavorite([5], 7)).toEqual([7, 5])
    expect(toggleFavorite([7, 5], 5)).toEqual([7])
    const full = Array.from({ length: MAX_FAVORITES }, (_, i) => i + 1)
    const next = toggleFavorite(full, 999)
    expect(next).toHaveLength(MAX_FAVORITES)
    expect(next[0]).toBe(999)
  })

  it('does not mutate its input', () => {
    const input = Object.freeze([1, 2])
    expect(() => toggleFavorite(input, 3)).not.toThrow()
  })

  it.each([[null], [''], ['not json'], ['{"a":1}'], ['["x"]'], ['[1.5]'], ['[-3]']])(
    'treats corrupt stored data %j as no favourites',
    (raw) => {
      expect(parseFavorites(raw)).toEqual([])
    },
  )

  it('parses valid data and removes duplicates', () => {
    expect(parseFavorites('[3,1,3,2]')).toEqual([3, 1, 2])
  })
})

describe('settings', () => {
  it('falls back to defaults for missing, corrupt or out-of-range data', () => {
    for (const raw of [
      null,
      '',
      'oops',
      '{}',
      '{"tankLiters":5,"hideStalePrices":false}',
      '{"tankLiters":50}',
    ]) {
      expect(parseSettings(raw)).toEqual(DEFAULT_SETTINGS)
    }
  })

  it('reads valid settings', () => {
    expect(parseSettings('{"tankLiters":65,"hideStalePrices":true}')).toEqual({
      tankLiters: 65,
      hideStalePrices: true,
    })
  })

  it('clamps the tank size', () => {
    expect(clampTank(5)).toBe(20)
    expect(clampTank(500)).toBe(120)
    expect(clampTank(47.6)).toBe(48)
  })
})

describe('search cache', () => {
  const params = {
    latitude: 48.8566,
    longitude: 2.3522,
    fuel: 'gazole',
    sort: 'price',
    limit: 60,
    bounds: { minLatitude: 48.8, minLongitude: 2.3, maxLatitude: 48.9, maxLongitude: 2.4 },
  } as const

  it('builds the same key for nearly the same view and a different one for another fuel', () => {
    const moved = {
      ...params,
      bounds: {
        minLatitude: 48.8004,
        minLongitude: 2.3004,
        maxLatitude: 48.9004,
        maxLongitude: 2.4004,
      },
    }
    expect(areaCacheKey(params)).toBe(areaCacheKey(moved))
    expect(areaCacheKey(params)).not.toBe(areaCacheKey({ ...params, fuel: 'sp98' }))
    // The exact key, which tags a live answer, tells those two views apart.
    expect(areaKey(params)).not.toBe(areaKey(moved))
  })

  it('keeps the newest entries first, replaces duplicates and caps the size', () => {
    let entries = parseCache(null)
    for (let i = 0; i < 12; i += 1) entries = putEntry(entries, `k${i}`, [], `2026-10-${10 + i}`)
    expect(entries).toHaveLength(8)
    expect(entries[0]?.key).toBe('k11')
    entries = putEntry(entries, 'k5', [station({ id: 1, price: 1.9 })], '2026-11-01')
    expect(entries[0]).toMatchObject({ key: 'k5', savedAt: '2026-11-01' })
    expect(entries.filter((e) => e.key === 'k5')).toHaveLength(1)
    expect(findEntry(entries, 'k5')?.stations).toHaveLength(1)
  })

  it('round-trips through JSON and rejects corrupt content', () => {
    const entries = putEntry([], 'k', [station({ id: 1, price: 1.9 })], '2026-10-17')
    expect(parseCache(JSON.stringify(entries))).toEqual(entries)
    expect(parseCache('{"nope":true}')).toEqual([])
    expect(parseCache('garbage')).toEqual([])
    expect(
      parseCache(JSON.stringify([{ key: 'k', savedAt: 'x', stations: [{ id: 'bad' }] }])),
    ).toEqual([])
  })
})
