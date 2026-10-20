import { describe, expect, it } from 'vitest'
import { fetchBrands, searchArea } from '../src/api'
import type { BrandOption } from '../src/contract'
import {
  chipOptions,
  isSupermarketGroupSelected,
  toggleBrand,
  toggleSupermarkets,
} from '../src/logic/brands'
import { areaCacheKey, areaKey } from '../src/logic/searchCache'

const option = (brand: string, group: BrandOption['group'], count = 3): BrandOption => ({
  brand,
  group,
  count,
})
const around = [
  option('TotalEnergies', 'oil'),
  option('E.Leclerc', 'supermarket'),
  option('Carrefour', 'supermarket'),
]

describe('brand selection', () => {
  it('toggles one brand without mutating the selection', () => {
    const selected = ['Esso'] as const
    expect(toggleBrand(selected, 'Shell')).toEqual(['Esso', 'Shell'])
    expect(toggleBrand(selected, 'Esso')).toEqual([])
    expect(selected).toEqual(['Esso'])
  })

  it('selects every supermarket around, and unselects them together', () => {
    const all = toggleSupermarkets(around, ['TotalEnergies'])
    expect(all).toEqual(['TotalEnergies', 'E.Leclerc', 'Carrefour'])
    expect(isSupermarketGroupSelected(around, all)).toBe(true)
    expect(toggleSupermarkets(around, all)).toEqual(['TotalEnergies'])
  })

  it('has no supermarket group when none is around', () => {
    expect(isSupermarketGroupSelected([option('Esso', 'oil')], [])).toBe(false)
  })

  it('keeps a selected brand visible even when it is not sold around here', () => {
    const chips = chipOptions(around, ['Auchan'])
    expect(chips.map((chip) => chip.brand)).toEqual([
      'TotalEnergies',
      'E.Leclerc',
      'Carrefour',
      'Auchan',
    ])
    expect(chips.at(-1)?.count).toBe(0)
  })
})

describe('brands in requests', () => {
  const params = {
    latitude: 48.85,
    longitude: 2.35,
    fuel: 'gazole',
    sort: 'price',
    limit: 60,
    bounds: { minLatitude: 48.8, minLongitude: 2.3, maxLatitude: 48.9, maxLongitude: 2.4 },
  } as const
  const capture = () => {
    const calls: string[] = []
    const fetchImpl: typeof fetch = async (input) => {
      calls.push(String(input))
      return new Response(
        JSON.stringify({
          success: true,
          data: [],
          error: null,
          meta: { count: 0, total: 0, truncated: false },
        }),
      )
    }
    return { calls, fetchImpl }
  }

  it('sends the chosen brands, and nothing when there are none', async () => {
    const { calls, fetchImpl } = capture()
    const options = { baseUrl: 'http://x', fetchImpl }
    await searchArea({ ...params, brands: ['E.Leclerc', 'Carrefour'] }, options)
    await searchArea({ ...params, brands: [] }, options)
    expect(new URL(calls[0] ?? '').searchParams.get('brands')).toBe('E.Leclerc,Carrefour')
    expect(new URL(calls[1] ?? '').searchParams.has('brands')).toBe(false)
  })

  it('asks the brands of an area', async () => {
    const { calls, fetchImpl } = capture()
    await fetchBrands(
      { latitude: 48.85, longitude: 2.35, fuel: 'gazole', radiusKm: 10 },
      { baseUrl: 'http://x', fetchImpl },
    )
    expect(calls[0]).toContain('/brands?lat=48.85&lon=2.35&fuel=gazole&radiusKm=10')
  })

  it('does not share an offline cache entry between different brand filters', () => {
    expect(areaCacheKey({ ...params, brands: ['Esso'] })).not.toBe(areaCacheKey(params))
    expect(areaKey({ ...params, brands: ['Esso'] })).not.toBe(areaKey(params))
    expect(areaCacheKey({ ...params, brands: ['B', 'A'] })).toBe(
      areaCacheKey({ ...params, brands: ['A', 'B'] }),
    )
  })
})
