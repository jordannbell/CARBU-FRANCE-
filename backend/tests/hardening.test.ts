import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { evaluateAlerts } from '../src/alerts/evaluate'
import { createExpoPush, type PushMessage, type PushPort } from '../src/alerts/push'
import { MAX_DEVICES } from '../src/alerts/store'
import { buildApp } from '../src/app'
import { StationRepository } from '../src/db/stationRepository'
import type { Station } from '../src/domain'
import { startIngestScheduler } from '../src/ingest/scheduler'
import { quantizeRadius } from '../src/routes/stations'
import { withDailyBudget } from '../src/routing/budget'
import { withGuards } from '../src/routing/guardedRouting'
import { RoutingError, type RoutingPort } from '../src/routing/types'

const NOW = new Date('2026-10-18T12:00:00Z')
const TOKEN = 'ExponentPushToken[abcdefghijklmnopqrstuv]'
const DEVICE_A = 'a'.repeat(32)
const DEVICE_B = 'b'.repeat(32)

const station = (id: number, price = 2, updatedAt = '2026-10-18T10:00:00Z'): Station => ({
  id,
  latitude: 48.85,
  longitude: 2.35,
  address: `${id} rue X`,
  city: 'Paris',
  postalCode: '75001',
  departmentCode: '75',
  open24h: false,
  services: [],
  hours: [],
  prices: [{ fuel: 'gazole', price, updatedAt }],
  shortages: [],
})

let repository: StationRepository
beforeEach(() => {
  repository = new StationRepository(':memory:')
})
afterEach(() => repository.close())

describe('a failed push is retried instead of being lost', () => {
  const failing: PushPort = { send: async (m) => m.map(() => ({ status: 'failed' as const })) }
  const working: PushPort = { send: async (m) => m.map(() => ({ status: 'ok' as const })) }

  it('re-arms the alert so the next run sends the notification again', async () => {
    repository.replaceAll([station(1, 1.8)], NOW.toISOString())
    repository.alerts.ensureDevice(DEVICE_A, TOKEN, NOW.toISOString())
    repository.alerts.upsert(DEVICE_A, 1, 'gazole', 1.9, NOW.toISOString())

    const first = await evaluateAlerts(repository.alerts, failing, NOW)
    expect(first).toMatchObject({ triggered: 1, notified: 0, failed: 1 })

    const second = await evaluateAlerts(repository.alerts, working, NOW)
    expect(second).toMatchObject({ triggered: 1, notified: 1, failed: 0 })
  })
})

describe('push diagnostics', () => {
  it('logs why a batch failed, without tokens or message content', async () => {
    const warn = vi.fn()
    const messages: PushMessage[] = [
      { to: TOKEN, title: 'secret title', body: 'secret body', data: { stationId: 1 } },
    ]
    const down: typeof fetch = async () => new Response('nope', { status: 503 })
    await createExpoPush(down, { warn }).send(messages)
    expect(warn).toHaveBeenCalledOnce()
    const logged = JSON.stringify(warn.mock.calls)
    expect(logged).toContain('http-error')
    expect(logged).toContain('503')
    expect(logged).not.toContain('ExponentPushToken')
    expect(logged).not.toContain('secret')
  })
})

describe('scheduler', () => {
  const logger = { info: vi.fn(), error: vi.fn() }

  it('counts the ingestion as done when only the post-ingestion step fails', async () => {
    const feed = [
      {
        id: 1,
        geom: { lat: 48.8, lon: 2.3 },
        gazole_prix: 1.9,
        gazole_maj: '2026-10-18T10:00:00Z',
      },
    ]
    const scheduler = startIngestScheduler({
      repository,
      intervalMs: 3_600_000,
      logger,
      deps: { fetchRaw: async () => feed },
      onSuccess: () => {
        throw new Error('evaluation exploded')
      },
    })
    const result = await scheduler.runOnce()
    expect(result?.stored).toBe(1)
    expect(repository.count()).toBe(1)
    expect(logger.error).toHaveBeenCalledWith(
      expect.anything(),
      expect.stringContaining('post-ingestion'),
    )
    await scheduler.stop()
  })

  it('waits for a run in progress before it reports stopped', async () => {
    let finished = false
    const feed = [
      {
        id: 1,
        geom: { lat: 48.8, lon: 2.3 },
        gazole_prix: 1.9,
        gazole_maj: '2026-10-18T10:00:00Z',
      },
    ]
    const scheduler = startIngestScheduler({
      repository,
      intervalMs: 3_600_000,
      logger,
      deps: {
        fetchRaw: async () => {
          await new Promise((resolve) => setTimeout(resolve, 30))
          finished = true
          return feed
        },
      },
    })
    void scheduler.runOnce()
    await scheduler.stop()
    expect(finished).toBe(true)
  })
})

describe('price history storage', () => {
  it('orders points correctly when the feed mixes UTC offsets', () => {
    repository.replaceAll([station(1, 1.9, '2026-10-10T12:00:00+02:00')], '2026-10-10T13:00:00Z') // 10:00Z
    repository.replaceAll([station(1, 2.0, '2026-10-10T11:00:00+00:00')], '2026-10-10T14:00:00Z') // 11:00Z
    const points = repository.priceHistory(1, 'gazole', '2026-10-01T00:00:00Z').points
    expect(points.map((p) => p.price)).toEqual([1.9, 2.0])
    expect(points.every((p) => p.at.endsWith('Z'))).toBe(true)
  })

  it('keeps the current price of a station whose price has not changed for over a year', () => {
    repository.replaceAll([station(1, 1.7, '2025-01-01T00:00:00Z')], '2025-01-01T01:00:00Z')
    repository.replaceAll([station(1, 1.7, '2026-10-18T00:00:00Z')], '2026-10-18T01:00:00Z')
    const history = repository.priceHistory(1, 'gazole', '2020-01-01T00:00:00Z')
    expect(history.points.map((p) => p.price)).toEqual([1.7])
    expect(history.since).not.toBeNull()
  })

  it('records a corrected price reported with the same timestamp', () => {
    repository.replaceAll([station(1, 1.9, '2026-10-18T10:00:00Z')], NOW.toISOString())
    repository.replaceAll([station(1, 1.8, '2026-10-18T10:00:00Z')], NOW.toISOString())
    const points = repository.priceHistory(1, 'gazole', '2026-10-01T00:00:00Z').points
    expect(points.map((p) => p.price)).toEqual([1.8])
  })
})

describe('route quota protection', () => {
  const provider: RoutingPort = {
    getRoute: async () => ({ distanceMeters: 1, durationSeconds: 1, path: [] }),
  }
  const at = (n: number) => ({ latitude: 48.85 + n * 0.01, longitude: 2.35 })

  it('stops calling the provider once the daily budget is spent, but still serves the cache', async () => {
    const guarded = withGuards(withDailyBudget(provider, { dailyBudget: 2 }))
    await guarded.getRoute(at(0), at(1))
    await guarded.getRoute(at(0), at(2))
    await expect(guarded.getRoute(at(0), at(3))).rejects.toMatchObject({ kind: 'busy' })
    await expect(guarded.getRoute(at(0), at(1))).resolves.toBeDefined() // cached: free
  })

  it('renews the budget the next UTC day', async () => {
    let now = Date.parse('2026-10-18T23:00:00Z')
    const guarded = withGuards(withDailyBudget(provider, { dailyBudget: 1, now: () => now }), {
      now: () => now,
    })
    await guarded.getRoute(at(0), at(1))
    await expect(guarded.getRoute(at(0), at(2))).rejects.toBeInstanceOf(RoutingError)
    now = Date.parse('2026-10-19T00:05:00Z')
    await expect(guarded.getRoute(at(0), at(2))).resolves.toBeDefined()
  })
})

describe('rate limiting behind a proxy', () => {
  const hit = (app: Awaited<ReturnType<typeof buildApp>>, forwardedFor: string) =>
    app.inject({
      url: '/health',
      remoteAddress: '10.0.0.1',
      headers: { 'x-forwarded-for': forwardedFor },
    })

  it('cannot be dodged by forging X-Forwarded-For when no proxy is trusted', async () => {
    const app = await buildApp({ repository, rateLimitPerMinute: 2, trustProxy: false })
    const statuses = [
      (await hit(app, '1.1.1.1')).statusCode,
      (await hit(app, '2.2.2.2')).statusCode,
      (await hit(app, '3.3.3.3')).statusCode,
    ]
    expect(statuses).toEqual([200, 200, 429])
  })

  it('uses the address the trusted proxy saw, and ignores forged hops before it', async () => {
    const app = await buildApp({ repository, rateLimitPerMinute: 2, trustProxy: 1 })
    const statuses = [
      (await hit(app, 'forged-1, 9.9.9.9')).statusCode,
      (await hit(app, 'forged-2, 9.9.9.9')).statusCode,
      (await hit(app, 'forged-3, 9.9.9.9')).statusCode,
    ]
    expect(statuses).toEqual([200, 200, 429])
    expect((await hit(app, 'forged, 8.8.8.8')).statusCode).toBe(200) // another real client
  })
})

describe('search radius', () => {
  it('rounds up to a fixed step so the cache cannot be dodged with decimals', () => {
    expect(quantizeRadius(0.3)).toBe(1)
    expect(quantizeRadius(9.9991)).toBe(10)
    expect(quantizeRadius(10)).toBe(10)
    expect(quantizeRadius(10.0001)).toBe(20)
    expect(quantizeRadius(49)).toBe(50)
  })

  it('still covers at least the radius that was asked', async () => {
    const north = { ...station(2), latitude: 48.85 + 0.04 } // ~4.45 km north
    repository.replaceAll([station(1), north], NOW.toISOString())
    const app = await buildApp({ repository, now: () => NOW })
    const res = await app.inject('/stations?lat=48.85&lon=2.35&fuel=gazole&radiusKm=4.4')
    expect(res.json().data.map((s: { id: number }) => s.id)).toContain(2)
  })
})

describe('alert tables cannot grow without bound', () => {
  const create = (app: Awaited<ReturnType<typeof buildApp>>, device: string) =>
    app.inject({
      method: 'POST',
      url: '/alerts',
      headers: { 'x-device-id': device },
      payload: { stationId: 1, fuel: 'gazole', threshold: 1.9 },
    })

  it('refuses new devices once the global ceiling is reached', async () => {
    repository.replaceAll([station(1)], NOW.toISOString())
    const app = await buildApp({ repository, alerts: repository.alerts, now: () => NOW })
    vi.spyOn(repository.alerts, 'deviceCount').mockReturnValue(MAX_DEVICES)
    const res = await create(app, 'd'.repeat(32))
    expect(res.statusCode).toBe(503)
    expect(res.json().error.code).toBe('ALERTS_FULL')
  })

  it('lets an existing device keep editing when only the device ceiling is reached', async () => {
    repository.replaceAll([station(1)], NOW.toISOString())
    repository.alerts.ensureDevice('e'.repeat(32), null, NOW.toISOString())
    const app = await buildApp({ repository, alerts: repository.alerts, now: () => NOW })
    vi.spyOn(repository.alerts, 'deviceCount').mockReturnValue(MAX_DEVICES)
    expect((await create(app, 'e'.repeat(32))).statusCode).toBe(201)
  })

  it('attaches a push token to one device only', () => {
    const nowIso = NOW.toISOString()
    repository.replaceAll([station(1)], nowIso)
    repository.alerts.ensureDevice(DEVICE_A, TOKEN, nowIso)
    repository.alerts.ensureDevice(DEVICE_B, TOKEN, nowIso) // claims the token
    repository.alerts.upsert(DEVICE_A, 1, 'gazole', 1.9, nowIso)
    repository.alerts.upsert(DEVICE_B, 1, 'gazole', 1.9, nowIso)
    const tokens = repository.alerts.due().map((alert) => [alert.deviceId[0], alert.pushToken])
    expect(tokens).toContainEqual(['b', TOKEN])
    expect(tokens).toContainEqual(['a', null])
  })
})

describe('migration to schema v4', () => {
  it('converts history timestamps that were stored with offsets, without losing points', () => {
    const dir = mkdtempSync(join(tmpdir(), 'carbu-v4-'))
    const path = join(dir, 'v3.db')
    try {
      new StationRepository(path).close() // creates the current schema
      const raw = new DatabaseSync(path)
      raw.exec('DELETE FROM price_history; PRAGMA user_version = 3;')
      const insert = raw.prepare(
        'INSERT INTO price_history (station_id, fuel, at, price) VALUES (?, ?, ?, ?)',
      )
      insert.run(1, 'gazole', '2026-10-10T12:00:00+02:00', 1.9) // 10:00Z
      insert.run(1, 'gazole', '2026-10-10T11:00:00+00:00', 2.0) // 11:00Z
      insert.run(1, 'gazole', '2026-10-12T09:00:00.000Z', 2.1) // already normalised
      raw.close()

      const upgraded = new StationRepository(path)
      const points = upgraded.priceHistory(1, 'gazole', '2026-10-01T00:00:00Z').points
      expect(points.map((p) => [p.at, p.price])).toEqual([
        ['2026-10-10T10:00:00.000Z', 1.9],
        ['2026-10-10T11:00:00.000Z', 2.0],
        ['2026-10-12T09:00:00.000Z', 2.1],
      ])
      upgraded.close()
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
