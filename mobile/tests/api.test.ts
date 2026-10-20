import { describe, expect, it } from 'vitest'
import { resolveApiUrl, searchArea } from '../src/api'

const params = {
  latitude: 48.85,
  longitude: 2.35,
  fuel: 'gazole',
  sort: 'price',
  limit: 60,
  bounds: { minLatitude: 48.8, minLongitude: 2.3, maxLatitude: 48.9, maxLongitude: 2.4 },
} as const
const okBody = {
  success: true,
  data: [
    {
      id: 1,
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
      price: 1.9,
      updatedAt: '2026-10-17T08:00:00Z',
      stale: false,
      shortage: null,
      distanceKm: 1.2,
    },
  ],
  error: null,
  meta: { count: 1, total: 1, truncated: false },
}

const respond =
  (body: unknown, status = 200) =>
  async () =>
    new Response(typeof body === 'string' ? body : JSON.stringify(body), { status })

describe('resolveApiUrl', () => {
  it('falls back to the emulator host in development only', () => {
    expect(resolveApiUrl(undefined, true)).toBe('http://10.0.2.2:3000')
    expect(() => resolveApiUrl(undefined, false)).toThrow(/not set/)
  })

  it('requires https in production builds', () => {
    expect(() => resolveApiUrl('http://api.example', false)).toThrow(/https/)
    expect(resolveApiUrl('https://api.example/', false)).toBe('https://api.example')
  })

  it('allows cleartext in development', () => {
    expect(resolveApiUrl('http://192.168.1.10:3000', true)).toBe('http://192.168.1.10:3000')
  })
})

describe('searchArea', () => {
  it('returns validated stations', async () => {
    const result = await searchArea(params, {
      baseUrl: 'https://x',
      fetchImpl: respond(okBody),
    })
    expect(result.stations).toHaveLength(1)
    expect(result.stations[0]?.price).toBe(1.9)
    expect(result.total).toBe(1)
    expect(result.truncated).toBe(false)
  })

  it('surfaces the server error message from an error envelope', async () => {
    const body = {
      success: false,
      data: null,
      error: { code: 'RATE_LIMITED', message: 'Too many' },
    }
    await expect(
      searchArea(params, { baseUrl: 'https://x', fetchImpl: respond(body, 429) }),
    ).rejects.toThrow('Too many')
  })

  it('does not crash on a non-JSON error page (proxy 502)', async () => {
    await expect(
      searchArea(params, {
        baseUrl: 'https://x',
        fetchImpl: respond('<html>Bad gateway</html>', 502),
      }),
    ).rejects.toThrow(/HTTP 502/)
  })

  it('reports when the area holds more stations than were returned', async () => {
    const cut = { ...okBody, meta: { count: 1, total: 120, truncated: true } }
    const result = await searchArea(params, { baseUrl: 'https://x', fetchImpl: respond(cut) })
    expect(result).toMatchObject({ total: 120, truncated: true })
  })

  it('rejects an answer without the area totals', async () => {
    const { meta: _meta, ...withoutMeta } = okBody
    await expect(
      searchArea(params, { baseUrl: 'https://x', fetchImpl: respond(withoutMeta) }),
    ).rejects.toThrow(/area totals/)
  })

  it('rejects a response that does not match the contract', async () => {
    const bad = { success: true, data: [{ id: 'nope' }], error: null }
    await expect(
      searchArea(params, { baseUrl: 'https://x', fetchImpl: respond(bad) }),
    ).rejects.toThrow(/Unexpected server response/)
  })

  it('propagates an abort from the caller', async () => {
    const controller = new AbortController()
    const slow: typeof fetch = (_input, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new Error('aborted')))
      })
    const pending = searchArea(params, {
      baseUrl: 'https://x',
      fetchImpl: slow,
      signal: controller.signal,
    })
    controller.abort()
    await expect(pending).rejects.toThrow('aborted')
  })

  it('sends the search as query parameters', async () => {
    let requested = ''
    const capture: typeof fetch = async (input) => {
      requested = String(input)
      return new Response(JSON.stringify(okBody))
    }
    await searchArea(params, { baseUrl: 'https://x', fetchImpl: capture })
    expect(requested).toBe(
      'https://x/stations?lat=48.85&lon=2.35&fuel=gazole&sort=price&bbox=48.8000%2C2.3000%2C48.9000%2C2.4000&limit=60',
    )
  })
})

describe('searchArea network failures', () => {
  it('names the unreachable server instead of a bare "fetch failed"', async () => {
    const down: typeof fetch = async () => {
      throw new TypeError('Network request failed')
    }
    await expect(
      searchArea(params, { baseUrl: 'http://10.0.2.2:3000', fetchImpl: down }),
    ).rejects.toThrow('Server unreachable (http://10.0.2.2:3000)')
  })
})
