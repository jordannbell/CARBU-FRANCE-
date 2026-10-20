import { describe, expect, it } from 'vitest'
import { ApiError, createAlert, deleteAlert, fetchAlerts, registerPushToken } from '../src/api'
import { bytesToHex, parseDeviceId } from '../src/logic/deviceId'
import {
  MAX_THRESHOLD_EUR,
  MIN_THRESHOLD_EUR,
  clampThreshold,
  isAlreadyReached,
  stepThreshold,
  suggestThreshold,
} from '../src/logic/alerts'

const DEVICE = 'a'.repeat(32)

interface Captured {
  url: string
  method: string | undefined
  headers: Headers
  body: unknown
}

const capture = (data: unknown, status = 200) => {
  const calls: Captured[] = []
  const impl: typeof fetch = async (input, init) => {
    calls.push({
      url: input instanceof URL ? input.href : typeof input === 'string' ? input : input.url,
      method: init?.method,
      headers: new Headers(init?.headers),
      body: typeof init?.body === 'string' ? JSON.parse(init.body) : undefined,
    })
    return new Response(JSON.stringify({ success: true, data, error: null }), { status })
  }
  return { calls, impl }
}

const alert = {
  id: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
  stationId: 7,
  fuel: 'gazole',
  threshold: 1.9,
  triggeredAt: null,
  createdAt: '2026-10-18T10:00:00Z',
  address: '1 rue X',
  city: 'Paris',
  currentPrice: 2.0,
  priceUpdatedAt: '2026-10-18T09:00:00Z',
  stale: false,
}

describe('alert API client', () => {
  it('lists alerts, sending the device id in a header and never in the URL', async () => {
    const { calls, impl } = capture([alert])
    const alerts = await fetchAlerts(DEVICE, { baseUrl: 'https://x', fetchImpl: impl })
    expect(alerts[0]?.threshold).toBe(1.9)
    expect(calls[0]?.url).toBe('https://x/alerts')
    expect(calls[0]?.url).not.toContain(DEVICE)
    expect(calls[0]?.headers.get('x-device-id')).toBe(DEVICE)
  })

  it('creates an alert with a JSON body and the device header', async () => {
    const { calls, impl } = capture({ id: alert.id }, 201)
    const result = await createAlert(
      DEVICE,
      { stationId: 7, fuel: 'gazole', threshold: 1.85, pushToken: null },
      { baseUrl: 'https://x', fetchImpl: impl },
    )
    expect(result.id).toBe(alert.id)
    expect(calls[0]).toMatchObject({
      method: 'POST',
      body: { stationId: 7, fuel: 'gazole', threshold: 1.85, pushToken: null },
    })
    expect(calls[0]?.headers.get('content-type')).toBe('application/json')
    expect(calls[0]?.headers.get('x-device-id')).toBe(DEVICE)
  })

  it('deletes an alert by id, encoding it', async () => {
    const { calls, impl } = capture({ deleted: true })
    await deleteAlert(DEVICE, 'a/b', { baseUrl: 'https://x', fetchImpl: impl })
    expect(calls[0]).toMatchObject({ method: 'DELETE', url: 'https://x/alerts/a%2Fb' })
  })

  it('registers a push token with PUT', async () => {
    const { calls, impl } = capture({ registered: true })
    await registerPushToken(DEVICE, 'ExponentPushToken[abcdefghijkl]', {
      baseUrl: 'https://x',
      fetchImpl: impl,
    })
    expect(calls[0]).toMatchObject({
      method: 'PUT',
      url: 'https://x/device/push-token',
      body: { pushToken: 'ExponentPushToken[abcdefghijkl]' },
    })
  })

  it('does not send a body or content type on a plain GET', async () => {
    const { calls, impl } = capture([])
    await fetchAlerts(DEVICE, { baseUrl: 'https://x', fetchImpl: impl })
    expect(calls[0]?.body).toBeUndefined()
    expect(calls[0]?.headers.get('content-type')).toBeNull()
  })

  it('surfaces the server error of a refused alert', async () => {
    const refused: typeof fetch = async () =>
      new Response(
        JSON.stringify({
          success: false,
          data: null,
          error: { code: 'TOO_MANY_ALERTS', message: 'At most 10 alerts per device' },
        }),
        { status: 409 },
      )
    const error = await createAlert(
      DEVICE,
      { stationId: 1, fuel: 'gazole', threshold: 1.9 },
      { baseUrl: 'https://x', fetchImpl: refused },
    ).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ApiError)
    expect((error as ApiError).detail).toContain('At most')
  })
})

describe('threshold helpers', () => {
  it('suggests five cents under the current price, to the cent', () => {
    expect(suggestThreshold(1.999)).toBe(1.94)
    expect(suggestThreshold(2.25)).toBe(2.2)
  })

  it('keeps thresholds inside the range the server accepts', () => {
    expect(clampThreshold(0.01)).toBe(MIN_THRESHOLD_EUR)
    expect(clampThreshold(99)).toBe(MAX_THRESHOLD_EUR)
    expect(suggestThreshold(0.4)).toBe(MIN_THRESHOLD_EUR)
  })

  it('steps by cents without floating point drift', () => {
    let value = 1.9
    for (let i = 0; i < 10; i += 1) value = stepThreshold(value, -0.01)
    expect(value).toBe(1.8)
    expect(stepThreshold(1.8, 0.05)).toBe(1.85)
  })

  it('tells when the threshold is already reached', () => {
    expect(isAlreadyReached(1.9, 1.85)).toBe(true)
    expect(isAlreadyReached(1.9, 1.9)).toBe(true)
    expect(isAlreadyReached(1.9, 1.95)).toBe(false)
  })
})

describe('device id', () => {
  it('encodes bytes as lowercase hex, two characters per byte', () => {
    expect(bytesToHex(new Uint8Array([0, 15, 16, 255]))).toBe('000f10ff')
    expect(bytesToHex(new Uint8Array(16))).toHaveLength(32)
  })

  it('accepts only a well formed stored id', () => {
    expect(parseDeviceId(DEVICE)).toBe(DEVICE)
    for (const raw of [null, '', 'short', 'A'.repeat(32), 'g'.repeat(32), `${DEVICE}0`]) {
      expect(parseDeviceId(raw)).toBeNull()
    }
  })
})
