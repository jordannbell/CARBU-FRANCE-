import { describe, expect, it } from 'vitest'
import { buildApp } from '../src/app'
import { StationRepository } from '../src/db/stationRepository'
import type { Station } from '../src/domain'
import { snapBoxOutward } from '../src/geo'

const station = (id: number, latitude: number, longitude: number, price: number): Station => ({
  id,
  latitude,
  longitude,
  address: `${id} rue Test`,
  city: 'Paris',
  postalCode: '75001',
  departmentCode: '75',
  open24h: false,
  services: [],
  hours: [],
  prices: [{ fuel: 'gazole', price, updatedAt: '2026-10-19T08:00:00.000Z' }],
  shortages: [],
})

const setup = async () => {
  const repo = new StationRepository(':memory:')
  repo.replaceAll(
    [
      station(1, 48.85, 2.35, 1.8),
      station(2, 48.86, 2.36, 1.7),
      station(3, 48.87, 2.37, 1.9),
      station(4, 45.76, 4.83, 1.6), // Lyon, far outside the Paris box
    ],
    '2026-10-19T08:00:00.000Z',
  )
  repo.replaceBrands(
    new Map([
      [1, { name: 'E.Leclerc', raw: 'Leclerc' }],
      [2, { name: 'Esso', raw: 'Esso' }],
    ]),
    '2026-10-19T08:00:00.000Z',
  )
  return { repo, app: await buildApp({ repository: repo }) }
}

const PARIS = '/stations?lat=48.86&lon=2.36&fuel=gazole'
const BOX = 'bbox=48.84,2.34,48.865,2.365'

describe('GET /stations with a visible-area box', () => {
  it('returns only the stations inside the box, with the total', async () => {
    const { repo, app } = await setup()
    const res = (await app.inject(`${PARIS}&${BOX}`)).json()
    expect(res.data.map((s: { id: number }) => s.id).sort()).toEqual([1, 2])
    expect(res.meta).toMatchObject({ count: 2, total: 2, truncated: false })
    repo.close()
  })

  it('says when the limit cut the answer', async () => {
    const { repo, app } = await setup()
    const res = (await app.inject(`${PARIS}&${BOX}&limit=1`)).json()
    expect(res.data).toHaveLength(1)
    expect(res.data[0].id).toBe(2)
    expect(res.meta).toMatchObject({ count: 1, total: 2, truncated: true })
    repo.close()
  })

  it('answers an empty area with an empty list', async () => {
    const { repo, app } = await setup()
    const res = (await app.inject(`${PARIS}&bbox=43.0,5.0,43.01,5.01`)).json()
    expect(res.data).toEqual([])
    expect(res.meta).toMatchObject({ total: 0, truncated: false })
    repo.close()
  })

  it.each([
    ['too large', 'bbox=40,-5,50,10'],
    ['inverted', 'bbox=48.9,2.4,48.8,2.3'],
    ['not numbers', 'bbox=a,b,c,d'],
    ['three values', 'bbox=48.8,2.3,48.9'],
    ['out of range', 'bbox=89.9,2.3,91,2.4'],
  ])('rejects a box that is %s', async (_name, bbox) => {
    const { repo, app } = await setup()
    expect((await app.inject(`${PARIS}&${bbox}`)).statusCode).toBe(400)
    repo.close()
  })

  it('combines the box with the brand filter', async () => {
    const { repo, app } = await setup()
    const res = (await app.inject(`${PARIS}&${BOX}&brands=Esso`)).json()
    expect(res.data.map((s: { id: number }) => s.id)).toEqual([2])
    expect(res.meta.total).toBe(1)
    repo.close()
  })

  it('does not mix cached answers between different areas', async () => {
    const { repo, app } = await setup()
    const first = (await app.inject(`${PARIS}&${BOX}`)).json().data.length
    const second = (await app.inject(`${PARIS}&bbox=45.7,4.8,45.8,4.9`)).json().data
    expect(first).toBe(2)
    expect(second.map((s: { id: number }) => s.id)).toEqual([4])
    repo.close()
  })

  it('keeps radius searches working without a box', async () => {
    const { repo, app } = await setup()
    const res = (await app.inject(`${PARIS}&radiusKm=5`)).json()
    expect(res.data).toHaveLength(3)
    expect(res.meta.truncated).toBe(false)
    repo.close()
  })

  it('lists the brands of the area', async () => {
    const { repo, app } = await setup()
    const res = (await app.inject(`/brands?lat=48.86&lon=2.36&fuel=gazole&${BOX}`)).json()
    expect(res.data.map((b: { brand: string }) => b.brand).sort()).toEqual(['E.Leclerc', 'Esso'])
    repo.close()
  })
})

describe('snapBoxOutward', () => {
  it('only grows the box, on a grid', () => {
    const box = {
      minLatitude: 48.8412,
      maxLatitude: 48.8648,
      minLongitude: 2.3411,
      maxLongitude: 2.3659,
    }
    const snapped = snapBoxOutward(box)
    expect(snapped.minLatitude).toBeLessThanOrEqual(box.minLatitude)
    expect(snapped.maxLatitude).toBeGreaterThanOrEqual(box.maxLatitude)
    expect(snapped.minLongitude).toBeLessThanOrEqual(box.minLongitude)
    expect(snapped.maxLongitude).toBeGreaterThanOrEqual(box.maxLongitude)
    expect(snapBoxOutward(snapped)).toEqual(snapped)
  })
})
