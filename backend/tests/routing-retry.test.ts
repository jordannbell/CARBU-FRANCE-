import { describe, expect, it } from 'vitest'
import { SERVER_TIMEOUT_MS } from '../src/app'
import { ORS_TOTAL_BUDGET_MS, createOrsRouting } from '../src/routing/ors'

const FROM = { latitude: 48.8566, longitude: 2.3522 }
const TO = { latitude: 48.87, longitude: 2.37 }
const okBody = {
  features: [
    {
      geometry: {
        coordinates: [
          [2.3522, 48.8566],
          [2.37, 48.87],
        ],
      },
      properties: { summary: { distance: 2345, duration: 412 } },
    },
  ],
}

describe('ORS retry', () => {
  it('retries once after a network failure and returns the second answer', async () => {
    let calls = 0
    const flaky: typeof fetch = async () => {
      calls += 1
      if (calls === 1)
        throw new DOMException('The operation was aborted due to timeout', 'TimeoutError')
      return new Response(JSON.stringify(okBody))
    }
    const route = await createOrsRouting('key', flaky).getRoute(FROM, TO)
    expect(route.distanceMeters).toBe(2345)
    expect(calls).toBe(2)
  })

  it('gives up after two failed attempts, with a generic error', async () => {
    let calls = 0
    const down: typeof fetch = async () => {
      calls += 1
      throw new TypeError('connect ECONNREFUSED')
    }
    await expect(createOrsRouting('key', down).getRoute(FROM, TO)).rejects.toMatchObject({
      kind: 'failed',
    })
    expect(calls).toBe(2)
  })

  it.each([429, 404, 401, 500])(
    'does not retry an HTTP %i answer: it would only spend quota',
    async (status) => {
      let calls = 0
      const answering: typeof fetch = async () => {
        calls += 1
        return new Response('{}', { status })
      }
      await expect(createOrsRouting('key', answering).getRoute(FROM, TO)).rejects.toBeDefined()
      expect(calls).toBe(1)
    },
  )

  it('gives every attempt its own timeout signal', async () => {
    const signals: AbortSignal[] = []
    const failing: typeof fetch = async (_url, init) => {
      if (init?.signal) signals.push(init.signal)
      throw new TypeError('x')
    }
    await createOrsRouting('key', failing)
      .getRoute(FROM, TO)
      ?.catch(() => undefined)
    expect(signals).toHaveLength(2)
    expect(signals[0]).not.toBe(signals[1])
  })
})

describe('timeout budget', () => {
  it('keeps the whole routing budget below the server socket timeout', () => {
    // Otherwise the server closes the connection before it can answer with its own error.
    expect(ORS_TOTAL_BUDGET_MS).toBeLessThan(SERVER_TIMEOUT_MS)
  })
})
