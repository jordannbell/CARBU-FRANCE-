import { describe, expect, it } from 'vitest'
import { buildApp } from '../src/app'
import { StationRepository } from '../src/db/stationRepository'
import {
  alertsEnvelopeSchema,
  envelopeSchema,
  brandOptionSchema,
  placesEnvelopeSchema,
  priceHistoryEnvelopeSchema,
  tripSchema,
  routeEnvelopeSchema,
  stationDetailEnvelopeSchema,
  stationListEnvelopeSchema,
} from '../../mobile/src/contract'
import fixture from './fixtures/records-paris.json'
import { parseStationRecords } from '../src/ingest/parseRecord'

// The mobile app validates every response with this schema: the real API output must satisfy it.
describe('API / mobile contract', () => {
  it('serves /stations in the shape the mobile app expects', async () => {
    const repository = new StationRepository(':memory:')
    const { stations } = parseStationRecords(fixture.results)
    repository.replaceAll(stations, new Date().toISOString())
    const app = await buildApp({ repository })

    const res = await app.inject('/stations?lat=48.8566&lon=2.3522&fuel=gazole&radiusKm=15')
    const parsed = stationListEnvelopeSchema.safeParse(res.json())

    expect(parsed.success).toBe(true)
    expect(parsed.success && parsed.data.success && parsed.data.data.length).toBeGreaterThan(0)
    repository.close()
  })

  it('serves error envelopes the mobile app can read', async () => {
    const repository = new StationRepository(':memory:')
    const app = await buildApp({ repository })

    const res = await app.inject('/stations?lat=abc&lon=2&fuel=gazole')
    const parsed = stationListEnvelopeSchema.safeParse(res.json())

    expect(parsed.success && !parsed.data.success && parsed.data.error.code).toBe('INVALID_QUERY')
    repository.close()
  })
})

describe('API / mobile contract (route)', () => {
  it('serves /stations/:id/route in the shape the mobile app expects', async () => {
    const repository = new StationRepository(':memory:')
    const { stations } = parseStationRecords(fixture.results)
    repository.replaceAll(stations, new Date().toISOString())
    const target = stations[0]
    const routing = {
      getRoute: async () => ({
        distanceMeters: 1200,
        durationSeconds: 300,
        path: [
          { latitude: 48.85, longitude: 2.35 },
          { latitude: 48.86, longitude: 2.36 },
        ],
      }),
    }
    const app = await buildApp({ repository, routing })

    const ok = await app.inject(`/stations/${target?.id}/route?lat=48.85&lon=2.35`)
    expect(routeEnvelopeSchema.safeParse(ok.json()).success).toBe(true)

    const unavailable = await (
      await buildApp({ repository })
    ).inject(`/stations/${target?.id}/route?lat=48.85&lon=2.35`)
    const parsed = routeEnvelopeSchema.safeParse(unavailable.json())
    expect(parsed.success && !parsed.data.success && parsed.data.error.code).toBe(
      'ROUTING_UNAVAILABLE',
    )
    repository.close()
  })
})

describe('API / mobile contract (detail, history, favourites, places)', () => {
  const setup = async () => {
    const repository = new StationRepository(':memory:')
    const { stations } = parseStationRecords(fixture.results)
    repository.replaceAll(stations, new Date().toISOString())
    const geocoder = {
      search: async () => [
        { label: 'Paris', city: 'Paris', postcode: '75000', latitude: 48.85, longitude: 2.35 },
      ],
    }
    const app = await buildApp({ repository, geocoder })
    return { repository, app, id: stations[0]?.id }
  }

  it('serves /stations/:id as the mobile detail schema', async () => {
    const { app, repository, id } = await setup()
    const res = await app.inject(`/stations/${id}`)
    const parsed = stationDetailEnvelopeSchema.safeParse(res.json())
    expect(parsed.success).toBe(true)
    repository.close()
  })

  it('serves /stations/:id/history as the mobile history schema', async () => {
    const { app, repository, id } = await setup()
    const res = await app.inject(`/stations/${id}/history?fuel=gazole&days=30`)
    expect(priceHistoryEnvelopeSchema.safeParse(res.json()).success).toBe(true)
    repository.close()
  })

  it('serves /stations/by-ids as the mobile station list schema', async () => {
    const { app, repository, id } = await setup()
    const res = await app.inject(`/stations/by-ids?ids=${id}&fuel=gazole&lat=48.85&lon=2.35`)
    const parsed = stationListEnvelopeSchema.safeParse(res.json())
    expect(parsed.success).toBe(true)
    repository.close()
  })

  it('serves /places as the mobile places schema', async () => {
    const { app, repository } = await setup()
    const res = await app.inject('/places?q=paris')
    expect(placesEnvelopeSchema.safeParse(res.json()).success).toBe(true)
    repository.close()
  })
})

describe('API / mobile contract (alerts)', () => {
  it('serves /alerts as the mobile alerts schema, including a triggered alert', async () => {
    const repository = new StationRepository(':memory:')
    const { stations } = parseStationRecords(fixture.results)
    repository.replaceAll(stations, new Date().toISOString())
    const app = await buildApp({ repository, alerts: repository.alerts })
    const device = 'c'.repeat(32)
    const target = stations.find((s) => s.prices.some((p) => p.fuel === 'gazole'))

    const created = await app.inject({
      method: 'POST',
      url: '/alerts',
      headers: { 'x-device-id': device },
      payload: { stationId: target?.id, fuel: 'gazole', threshold: 4 },
    })
    expect(created.statusCode).toBe(201)

    const list = await app.inject({ url: '/alerts', headers: { 'x-device-id': device } })
    const parsed = alertsEnvelopeSchema.safeParse(list.json())
    expect(parsed.success).toBe(true)
    repository.close()
  })
})

describe('API / mobile contract (brands)', () => {
  it('serves /brands and the brand of each station as the mobile schemas expect', async () => {
    const z = await import('zod')
    const repository = new StationRepository(':memory:')
    const { stations } = parseStationRecords(fixture.results)
    repository.replaceAll(stations, new Date().toISOString())
    const first = stations.find((s) => s.prices.some((p) => p.fuel === 'gazole'))
    repository.replaceBrands(
      new Map([[first?.id ?? 0, { name: 'E.Leclerc', raw: 'Leclerc' }]]),
      new Date().toISOString(),
    )
    const app = await buildApp({ repository })

    const brands = await app.inject('/brands?lat=48.8566&lon=2.3522&fuel=gazole&radiusKm=50')
    expect(envelopeSchema(z.z.array(brandOptionSchema)).safeParse(brands.json()).success).toBe(true)
    const list = await app.inject('/stations?lat=48.8566&lon=2.3522&fuel=gazole&radiusKm=50')
    expect(stationListEnvelopeSchema.safeParse(list.json()).success).toBe(true)
    const detail = await app.inject(`/stations/${first?.id}`)
    expect(stationDetailEnvelopeSchema.safeParse(detail.json()).success).toBe(true)
    repository.close()
  })
})

describe('API / mobile contract (area and trip)', () => {
  it('serves the area totals and the trip in the shape the mobile app expects', async () => {
    const { z } = await import('zod')
    const repository = new StationRepository(':memory:')
    const { stations } = parseStationRecords(fixture.results)
    repository.replaceAll(stations, new Date().toISOString())
    const routing = {
      getRoute: async () => ({
        distanceMeters: 5000,
        durationSeconds: 600,
        provider: 'osrm' as const,
        path: [
          { latitude: 48.8, longitude: 2.25 },
          { latitude: 48.9, longitude: 2.45 },
        ],
      }),
    }
    const app = await buildApp({ repository, routing })

    const area = (
      await app.inject(
        '/stations?lat=48.8566&lon=2.3522&fuel=gazole&bbox=48.7,2.2,49.0,2.5&limit=5',
      )
    ).json()
    expect(stationListEnvelopeSchema.safeParse(area).success).toBe(true)
    expect(
      z.object({ total: z.number(), truncated: z.boolean() }).safeParse(area.meta).success,
    ).toBe(true)

    const trip = (
      await app.inject(
        '/trip/stations?lat=48.8&lon=2.25&toLat=48.9&toLon=2.45&fuel=gazole&corridorKm=5',
      )
    ).json()
    expect(envelopeSchema(tripSchema).safeParse(trip).success).toBe(true)
    repository.close()
  })
})
