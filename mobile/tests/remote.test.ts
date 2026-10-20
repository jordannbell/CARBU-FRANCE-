import { describe, expect, it } from 'vitest'
import { ApiError, createAlert, forgetDevice } from '../src/api'
import { isSafeHttpsUrl } from '../src/logic/url'
import { EMPTY, failed, startLoading, viewFor, type Stored } from '../src/useRemote'

const done = <T>(key: string, data: T): Stored<T> => ({ key, state: { status: 'done', data } })

describe('viewFor: data is only ever shown for the key it answered', () => {
  it('shows nothing when there is nothing to load', () => {
    expect(viewFor(done('gazole', [1]), null)).toEqual({ status: 'idle', data: undefined })
    expect(viewFor(EMPTY, null).status).toBe('idle')
  })

  it('never shows the previous fuel while the new one loads (the cache must not be poisoned)', () => {
    const gazole = done('search|gazole', ['gazole station'])
    // The user picked sp98: the stored answer is for gazole.
    expect(viewFor(gazole, 'search|sp98')).toEqual({ status: 'loading', data: undefined })
  })

  it('shows the answer for the current key', () => {
    expect(viewFor(done('k', [1, 2]), 'k')).toEqual({ status: 'done', data: [1, 2] })
  })
})

describe('reloading the same key keeps what is on screen', () => {
  it('keeps the data while reloading, so pull-to-refresh never blanks the list', () => {
    const next = startLoading(done('k', [1]), 'k')
    expect(next.state).toEqual({ status: 'loading', data: [1] })
  })

  it('keeps the data after a failed reload and records the reason', () => {
    const next = failed(done('k', [1]), 'k', { kind: 'network', detail: 'down' })
    expect(next.state).toMatchObject({ status: 'error', data: [1], kind: 'network' })
  })

  it('drops the data when the key changed, even on failure', () => {
    expect(startLoading(done('old', [1]), 'new').state.data).toBeUndefined()
    const next = failed(done('old', [1]), 'new', { kind: 'timeout', detail: 'slow' })
    expect(next.state.data).toBeUndefined()
  })
})

describe('isSafeHttpsUrl', () => {
  it.each([
    ['https://ko-fi.com/someone', true],
    ['https://example.org', true],
    ['http://example.org', false],
    ['javascript:alert(1)', false],
    ['intent://scan/#Intent;scheme=zxing;end', false],
    ['file:///etc/passwd', false],
    ['not a url', false],
    ['', false],
    [undefined, false],
  ])('%j -> %s', (value, expected) => {
    expect(isSafeHttpsUrl(value)).toBe(expected)
  })
})

describe('erasure and alert limits', () => {
  const DEVICE = 'a'.repeat(32)

  it('asks the server to forget the device with a DELETE and the device header', async () => {
    const calls: { url: string; method?: string; device: string | null }[] = []
    const impl: typeof fetch = async (input, init) => {
      calls.push({
        url: typeof input === 'string' ? input : input instanceof URL ? input.href : input.url,
        method: init?.method,
        device: new Headers(init?.headers).get('x-device-id'),
      })
      return new Response(JSON.stringify({ success: true, data: { deleted: true }, error: null }))
    }
    await forgetDevice(DEVICE, { baseUrl: 'https://x', fetchImpl: impl })
    expect(calls).toEqual([{ url: 'https://x/device', method: 'DELETE', device: DEVICE }])
  })

  it('reports a failed erasure instead of pretending it worked', async () => {
    const down: typeof fetch = async () => {
      throw new TypeError('network')
    }
    await expect(
      forgetDevice(DEVICE, { baseUrl: 'https://x', fetchImpl: down }),
    ).rejects.toBeInstanceOf(ApiError)
  })

  it('tells "too many alerts" apart by code, not by the wording of the message', async () => {
    const full: typeof fetch = async () =>
      new Response(
        JSON.stringify({
          success: false,
          data: null,
          error: { code: 'TOO_MANY_ALERTS', message: 'any wording at all' },
        }),
        { status: 409 },
      )
    const error = await createAlert(
      DEVICE,
      { stationId: 1, fuel: 'gazole', threshold: 1.9 },
      { baseUrl: 'https://x', fetchImpl: full },
    ).catch((e: unknown) => e)
    expect((error as ApiError).kind).toBe('too-many')
  })
})
