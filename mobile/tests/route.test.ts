import { describe, expect, it } from 'vitest'
import { ApiError, fetchRoute } from '../src/api'
import { formatDuration } from '../src/format'

const origin = { latitude: 48.8566, longitude: 2.3522 }
const routeBody = {
  success: true,
  data: {
    distanceMeters: 2346,
    durationSeconds: 412,
    path: [
      { latitude: 48.8566, longitude: 2.3522 },
      { latitude: 48.87, longitude: 2.37 },
    ],
  },
  error: null,
  meta: { attribution: 'x' },
}
const reply =
  (body: unknown, status = 200) =>
  async () =>
    new Response(JSON.stringify(body), { status })
const failure = (code: string, status: number) =>
  reply({ success: false, data: null, error: { code, message: 'details' } }, status)

const kindOf = async (fetchImpl: typeof fetch): Promise<string> => {
  try {
    await fetchRoute(7, origin, { baseUrl: 'https://x', fetchImpl })
  } catch (error) {
    return error instanceof ApiError ? error.kind : 'not-api-error'
  }
  return 'no-error'
}

describe('fetchRoute', () => {
  it('returns the validated route', async () => {
    const route = await fetchRoute(7, origin, { baseUrl: 'https://x', fetchImpl: reply(routeBody) })
    expect(route.distanceMeters).toBe(2346)
    expect(route.path).toHaveLength(2)
  })

  it('asks for the station id and sends only the user position', async () => {
    let requested = ''
    const capture: typeof fetch = async (input) => {
      requested = String(input)
      return new Response(JSON.stringify(routeBody))
    }
    await fetchRoute(7, origin, { baseUrl: 'https://x', fetchImpl: capture })
    expect(requested).toBe('https://x/stations/7/route?lat=48.8566&lon=2.3522')
  })

  it.each([
    ['ROUTING_UNAVAILABLE', 503, 'unavailable'],
    ['ROUTING_BUSY', 503, 'unavailable'],
    ['NO_ROUTE', 422, 'no-route'],
    ['TOO_FAR', 400, 'too-far'],
    ['RATE_LIMITED', 429, 'rate-limited'],
    ['ROUTING_FAILED', 502, 'server'],
  ])('maps %s to the %s kind', async (code, status, kind) => {
    expect(await kindOf(failure(code, status))).toBe(kind)
  })

  it('rejects a route that breaks the contract', async () => {
    const bad = { success: true, data: { distanceMeters: 'far' }, error: null }
    expect(await kindOf(reply(bad))).toBe('invalid')
  })
})

describe('formatDuration', () => {
  it.each([
    [10, '1 min'],
    [412, '7 min'],
    [3600, '1 h'],
    [5400, '1 h 30 min'],
  ])('formats %i seconds as %s', (seconds, expected) => {
    expect(formatDuration(seconds)).toBe(expected)
  })
})
