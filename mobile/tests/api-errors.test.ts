import { describe, expect, it } from 'vitest'
import { ApiError, searchArea } from '../src/api'

const params = {
  latitude: 48.85,
  longitude: 2.35,
  fuel: 'gazole',
  sort: 'price',
  limit: 60,
  bounds: { minLatitude: 48.8, minLongitude: 2.3, maxLatitude: 48.9, maxLongitude: 2.4 },
} as const

const kindOf = async (fetchImpl: typeof fetch): Promise<string> => {
  try {
    await searchArea(params, { baseUrl: 'https://x', fetchImpl })
  } catch (error) {
    return error instanceof ApiError ? error.kind : 'not-api-error'
  }
  return 'no-error'
}

const envelope = (code: string, status: number) => async () =>
  new Response(
    JSON.stringify({ success: false, data: null, error: { code, message: 'details' } }),
    { status },
  )

describe('ApiError kinds drive the user-facing copy', () => {
  it('classifies a refused connection as network', async () => {
    const down: typeof fetch = async () => {
      throw new TypeError('Network request failed')
    }
    expect(await kindOf(down)).toBe('network')
  })

  it('classifies a rate-limit envelope as rate-limited', async () => {
    expect(await kindOf(envelope('RATE_LIMITED', 429))).toBe('rate-limited')
  })

  it('classifies other server errors as server', async () => {
    expect(await kindOf(envelope('INTERNAL', 500))).toBe('server')
  })

  it('classifies a malformed body as invalid', async () => {
    const html: typeof fetch = async () => new Response('<html></html>', { status: 502 })
    expect(await kindOf(html)).toBe('invalid')
  })

  it('does not wrap a caller abort as a network error', async () => {
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
    await expect(pending).rejects.not.toBeInstanceOf(ApiError)
  })
})
