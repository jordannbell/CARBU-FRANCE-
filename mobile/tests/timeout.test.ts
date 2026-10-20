import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError, fetchRoute } from '../src/api'

const origin = { latitude: 48.85, longitude: 2.35 }

describe('client timeout', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  // React Native rejects an aborted fetch with a generic native error and exposes no abort reason.
  const hangingNativeFetch: typeof fetch = (_input, init) =>
    new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => {
        reject(
          new Error('Fetch request has been canceled (expo/native FetchRequestCanceledException)'),
        )
      })
    })

  it('reports a timeout, not the raw native error, when the server never answers', async () => {
    const pending = fetchRoute(7, origin, { baseUrl: 'https://x', fetchImpl: hangingNativeFetch })
    const outcome = pending.catch((error: unknown) => error)
    await vi.advanceTimersByTimeAsync(15_001)
    const error = await outcome
    expect(error).toBeInstanceOf(ApiError)
    expect((error as ApiError).kind).toBe('timeout')
    expect((error as ApiError).detail).not.toContain('FetchRequestCanceledException')
  })

  it('does not time out a request that answers in time', async () => {
    const fast: typeof fetch = async () =>
      new Response(
        JSON.stringify({
          success: true,
          data: { distanceMeters: 1, durationSeconds: 1, path: [] },
          error: null,
        }),
      )
    const route = await fetchRoute(7, origin, { baseUrl: 'https://x', fetchImpl: fast })
    await vi.advanceTimersByTimeAsync(20_000)
    expect(route.distanceMeters).toBe(1)
  })

  it('still lets the caller cancel without reporting an API error', async () => {
    const controller = new AbortController()
    const pending = fetchRoute(7, origin, {
      baseUrl: 'https://x',
      fetchImpl: hangingNativeFetch,
      signal: controller.signal,
    })
    const outcome = pending.catch((error: unknown) => error)
    controller.abort()
    const error = await outcome
    expect(error).not.toBeInstanceOf(ApiError)
  })
})
