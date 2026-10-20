import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { evaluateAlerts } from '../src/alerts/evaluate'
import { createExpoPush, type PushMessage, type PushPort } from '../src/alerts/push'
import { MAX_ALERTS_PER_DEVICE } from '../src/alerts/store'
import { buildApp } from '../src/app'
import { StationRepository } from '../src/db/stationRepository'
import type { Station } from '../src/domain'

const NOW = new Date('2026-10-18T12:00:00Z')
const DEVICE = 'a'.repeat(32)
const OTHER_DEVICE = 'b'.repeat(32)
const TOKEN = 'ExponentPushToken[abcdefghijklmnopqrstuv]'

const station = (id: number, price: number, updatedAt = '2026-10-18T10:00:00Z'): Station => ({
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

const recordingPush = () => {
  const sent: PushMessage[] = []
  const push: PushPort = {
    send: async (messages) => {
      sent.push(...messages)
      return messages.map(() => ({ status: 'ok' as const }))
    },
  }
  return { push, sent }
}

const makeApp = () => buildApp({ repository, alerts: repository.alerts, now: () => NOW })
const asDevice = (id: string) => ({ 'x-device-id': id })
const post = (app: Awaited<ReturnType<typeof makeApp>>, body: unknown, device = DEVICE) =>
  app.inject({ method: 'POST', url: '/alerts', headers: asDevice(device), payload: body as object })

describe('alert routes', () => {
  beforeEach(() => repository.replaceAll([station(1, 2.0), station(2, 1.9)], NOW.toISOString()))

  it('creates an alert and lists it with the current price', async () => {
    const app = await makeApp()
    const created = await post(app, { stationId: 1, fuel: 'gazole', threshold: 1.9 })
    expect(created.statusCode).toBe(201)

    const list = await app.inject({ url: '/alerts', headers: asDevice(DEVICE) })
    expect(list.json().data).toMatchObject([
      {
        stationId: 1,
        fuel: 'gazole',
        threshold: 1.9,
        currentPrice: 2.0,
        address: '1 rue X',
        triggeredAt: null,
        stale: false,
      },
    ])
    expect(list.headers['cache-control']).toBe('private, no-store')
  })

  it('moves the threshold instead of duplicating an alert for the same station and fuel', async () => {
    const app = await makeApp()
    await post(app, { stationId: 1, fuel: 'gazole', threshold: 1.9 })
    await post(app, { stationId: 1, fuel: 'gazole', threshold: 1.8 })
    const list = await app.inject({ url: '/alerts', headers: asDevice(DEVICE) })
    expect(list.json().data).toHaveLength(1)
    expect(list.json().data[0].threshold).toBe(1.8)
  })

  it('refuses a missing or malformed device id', async () => {
    const app = await makeApp()
    for (const headers of [{}, asDevice('short'), asDevice('Z'.repeat(32))]) {
      const res = await app.inject({ url: '/alerts', headers })
      expect(res.statusCode).toBe(401)
      expect(res.json().error.code).toBe('DEVICE_REQUIRED')
    }
  })

  it.each([
    ['threshold too low', { stationId: 1, fuel: 'gazole', threshold: 0.1 }],
    ['threshold too high', { stationId: 1, fuel: 'gazole', threshold: 50 }],
    ['unknown fuel', { stationId: 1, fuel: 'kerosene', threshold: 1.9 }],
    ['non numeric threshold', { stationId: 1, fuel: 'gazole', threshold: '1.9' }],
    ['bad push token', { stationId: 1, fuel: 'gazole', threshold: 1.9, pushToken: 'not-a-token' }],
    ['missing station id', { fuel: 'gazole', threshold: 1.9 }],
  ])('rejects %s', async (_label, body) => {
    expect((await post(await makeApp(), body)).statusCode).toBe(400)
  })

  it('answers 404 for an unknown station', async () => {
    const res = await post(await makeApp(), { stationId: 999, fuel: 'gazole', threshold: 1.9 })
    expect(res.statusCode).toBe(404)
  })

  it('caps the number of alerts per device but still allows editing one', async () => {
    const stations = Array.from({ length: MAX_ALERTS_PER_DEVICE + 1 }, (_, i) => station(i + 1, 2))
    repository.replaceAll(stations, NOW.toISOString())
    const app = await makeApp()
    for (let id = 1; id <= MAX_ALERTS_PER_DEVICE; id += 1) {
      expect((await post(app, { stationId: id, fuel: 'gazole', threshold: 1.9 })).statusCode).toBe(
        201,
      )
    }
    const extra = await post(app, {
      stationId: MAX_ALERTS_PER_DEVICE + 1,
      fuel: 'gazole',
      threshold: 1.9,
    })
    expect(extra.statusCode).toBe(409)
    const edit = await post(app, { stationId: 1, fuel: 'gazole', threshold: 1.7 })
    expect(edit.statusCode).toBe(201)
  })

  it('keeps each device’s alerts private', async () => {
    const app = await makeApp()
    const created = await post(app, { stationId: 1, fuel: 'gazole', threshold: 1.9 })
    const id = created.json().data.id as string

    const other = await app.inject({ url: '/alerts', headers: asDevice(OTHER_DEVICE) })
    expect(other.json().data).toEqual([])

    const steal = await app.inject({
      method: 'DELETE',
      url: `/alerts/${id}`,
      headers: asDevice(OTHER_DEVICE),
    })
    expect(steal.statusCode).toBe(404)

    const own = await app.inject({
      method: 'DELETE',
      url: `/alerts/${id}`,
      headers: asDevice(DEVICE),
    })
    expect(own.statusCode).toBe(200)
    const after = await app.inject({ url: '/alerts', headers: asDevice(DEVICE) })
    expect(after.json().data).toEqual([])
  })

  it('rejects a malformed alert id', async () => {
    const res = await (
      await makeApp()
    ).inject({
      method: 'DELETE',
      url: "/alerts/1'; DROP TABLE alerts;--",
      headers: asDevice(DEVICE),
    })
    expect(res.statusCode).toBe(400)
  })

  it('registers and removes a push token, and forgets the device on request', async () => {
    const app = await makeApp()
    await post(app, { stationId: 1, fuel: 'gazole', threshold: 1.9 })

    const set = await app.inject({
      method: 'PUT',
      url: '/device/push-token',
      headers: asDevice(DEVICE),
      payload: { pushToken: TOKEN },
    })
    expect(set.json().data).toEqual({ registered: true })
    const bad = await app.inject({
      method: 'PUT',
      url: '/device/push-token',
      headers: asDevice(DEVICE),
      payload: { pushToken: 'nope' },
    })
    expect(bad.statusCode).toBe(400)

    await app.inject({ method: 'DELETE', url: '/device', headers: asDevice(DEVICE) })
    const list = await app.inject({ url: '/alerts', headers: asDevice(DEVICE) })
    expect(list.json().data).toEqual([])
  })

  it('answers 503 when alerts are not configured', async () => {
    const res = await (
      await buildApp({ repository })
    ).inject({ url: '/alerts', headers: asDevice(DEVICE) })
    expect(res.statusCode).toBe(503)
  })

  it('does not log or return the push token', async () => {
    const app = await makeApp()
    const res = await post(app, { stationId: 1, fuel: 'gazole', threshold: 1.9, pushToken: TOKEN })
    expect(res.body).not.toContain('ExponentPushToken')
    const list = await app.inject({ url: '/alerts', headers: asDevice(DEVICE) })
    expect(list.body).not.toContain('ExponentPushToken')
  })
})

describe('evaluateAlerts', () => {
  const setup = (price: number, options: { token?: string | null; updatedAt?: string } = {}) => {
    repository.replaceAll([station(1, price, options.updatedAt)], NOW.toISOString())
    repository.alerts.ensureDevice(
      DEVICE,
      options.token === undefined ? TOKEN : options.token,
      NOW.toISOString(),
    )
    repository.alerts.upsert(DEVICE, 1, 'gazole', 1.9, NOW.toISOString())
  }

  it('notifies once when the price drops to the threshold, then stays quiet while it stays low', async () => {
    setup(1.85)
    const { push, sent } = recordingPush()
    expect(await evaluateAlerts(repository.alerts, push, NOW)).toEqual({
      triggered: 1,
      notified: 1,
      rearmed: 0,
      failed: 0,
    })
    expect(sent[0]).toMatchObject({ to: TOKEN, data: { stationId: 1 } })
    expect(sent[0]?.body).toContain('1,850')

    expect(await evaluateAlerts(repository.alerts, push, NOW)).toEqual({
      triggered: 0,
      notified: 0,
      rearmed: 0,
      failed: 0,
    })
    expect(sent).toHaveLength(1)
  })

  it('re-arms when the price goes back above the threshold, so the next drop notifies again', async () => {
    setup(1.85)
    const { push, sent } = recordingPush()
    await evaluateAlerts(repository.alerts, push, NOW)

    repository.replaceAll([station(1, 2.05)], NOW.toISOString())
    expect((await evaluateAlerts(repository.alerts, push, NOW)).rearmed).toBe(1)

    repository.replaceAll([station(1, 1.88)], NOW.toISOString())
    await evaluateAlerts(repository.alerts, push, NOW)
    expect(sent).toHaveLength(2)
  })

  it('does not fire for a price above the threshold', async () => {
    setup(2.05)
    const { push, sent } = recordingPush()
    expect((await evaluateAlerts(repository.alerts, push, NOW)).triggered).toBe(0)
    expect(sent).toHaveLength(0)
  })

  it('ignores a stale price: it cannot be trusted to be real', async () => {
    setup(1.5, { updatedAt: '2026-09-01T00:00:00Z' })
    const { push, sent } = recordingPush()
    expect((await evaluateAlerts(repository.alerts, push, NOW)).triggered).toBe(0)
    expect(sent).toHaveLength(0)
  })

  it('ignores a station that is out of stock for this fuel', async () => {
    const out = station(1, 1.5)
    repository.replaceAll(
      [
        {
          ...out,
          shortages: [{ fuel: 'gazole', type: 'temporaire', since: '2026-10-17T00:00:00Z' }],
        },
      ],
      NOW.toISOString(),
    )
    repository.alerts.ensureDevice(DEVICE, TOKEN, NOW.toISOString())
    repository.alerts.upsert(DEVICE, 1, 'gazole', 1.9, NOW.toISOString())
    const { push, sent } = recordingPush()
    expect((await evaluateAlerts(repository.alerts, push, NOW)).triggered).toBe(0)
    expect(sent).toHaveLength(0)
  })

  it('still records the alert as triggered when the device has no push token', async () => {
    setup(1.85, { token: null })
    const { push, sent } = recordingPush()
    expect((await evaluateAlerts(repository.alerts, push, NOW)).triggered).toBe(1)
    expect(sent).toHaveLength(0)
    expect(repository.alerts.list(DEVICE)[0]?.triggeredAt).toBe(NOW.toISOString())
  })

  it('forgets a token the push service reports as dead', async () => {
    setup(1.85)
    const dead: PushPort = { send: async (m) => m.map(() => ({ status: 'unregistered' as const })) }
    const summary = await evaluateAlerts(repository.alerts, dead, NOW)
    expect(summary).toMatchObject({ triggered: 1, notified: 0 })
    expect(repository.alerts.due()[0]?.pushToken).toBeNull()
  })

  it('does nothing when the station disappeared from the feed', async () => {
    setup(1.85)
    repository.replaceAll([station(2, 1.5)], NOW.toISOString())
    const { push } = recordingPush()
    expect(await evaluateAlerts(repository.alerts, push, NOW)).toEqual({
      triggered: 0,
      notified: 0,
      rearmed: 0,
      failed: 0,
    })
  })
})

describe('createExpoPush', () => {
  const message = (n: number): PushMessage => ({
    to: TOKEN,
    title: 't',
    body: `b${n}`,
    data: { stationId: n },
  })
  const tickets =
    (statuses: ('ok' | 'DeviceNotRegistered' | 'MessageRateExceeded')[]) => async () =>
      new Response(
        JSON.stringify({
          data: statuses.map((s) =>
            s === 'ok'
              ? { status: 'ok', id: 'x' }
              : { status: 'error', message: 'm', details: { error: s } },
          ),
        }),
      )

  it('maps tickets to one result per message', async () => {
    const push = createExpoPush(tickets(['ok', 'DeviceNotRegistered', 'MessageRateExceeded']))
    const results = await push.send([message(1), message(2), message(3)])
    expect(results.map((r) => r.status)).toEqual(['ok', 'unregistered', 'failed'])
  })

  it('sends at most 100 messages per request', async () => {
    const sizes: number[] = []
    const spy: typeof fetch = async (_url, init) => {
      const batch = JSON.parse(typeof init?.body === 'string' ? init.body : '[]') as unknown[]
      sizes.push(batch.length)
      return new Response(JSON.stringify({ data: batch.map(() => ({ status: 'ok' })) }))
    }
    const many = Array.from({ length: 250 }, (_, i) => message(i + 1))
    const results = await createExpoPush(spy).send(many)
    expect(sizes).toEqual([100, 100, 50])
    expect(results).toHaveLength(250)
  })

  it('reports every message as failed when the push service is down or answers nonsense', async () => {
    const down: typeof fetch = async () => {
      throw new TypeError('network')
    }
    const garbage: typeof fetch = async () => new Response('<html>', { status: 200 })
    const mismatch = tickets(['ok'])
    for (const impl of [down, garbage, mismatch]) {
      const results = await createExpoPush(impl).send([message(1), message(2)])
      expect(results.map((r) => r.status)).toEqual(['failed', 'failed'])
    }
  })

  it('sends only to the fixed Expo endpoint', async () => {
    let url = ''
    const spy: typeof fetch = async (input) => {
      url = input instanceof URL ? input.href : typeof input === 'string' ? input : input.url
      return new Response(JSON.stringify({ data: [{ status: 'ok' }] }))
    }
    await createExpoPush(spy).send([message(1)])
    expect(url).toBe('https://exp.host/--/api/v2/push/send')
  })
})

describe('device retention', () => {
  it('removes inactive devices with their alerts, and keeps devices that are used', async () => {
    repository.replaceAll([station(1, 2.0)], NOW.toISOString())
    repository.alerts.ensureDevice(DEVICE, null, '2026-01-01T00:00:00Z')
    repository.alerts.upsert(DEVICE, 1, 'gazole', 1.9, '2026-01-01T00:00:00Z')
    repository.alerts.ensureDevice(OTHER_DEVICE, null, '2026-01-01T00:00:00Z')
    repository.alerts.upsert(OTHER_DEVICE, 1, 'gazole', 1.9, '2026-01-01T00:00:00Z')

    // Opening the alerts screen counts as activity.
    const app = await makeApp()
    await app.inject({ url: '/alerts', headers: asDevice(OTHER_DEVICE) })

    const removed = repository.alerts.deleteInactiveDevices('2026-06-01T00:00:00Z')
    expect(removed).toBe(1)
    expect(repository.alerts.list(DEVICE)).toEqual([])
    expect(repository.alerts.list(OTHER_DEVICE)).toHaveLength(1)
  })
})
