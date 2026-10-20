import { describe, expect, it } from 'vitest'
import { loadConfig } from '../src/config'
import { TtlCache } from '../src/ttlCache'

describe('loadConfig', () => {
  it('uses safe defaults: local bind, no CORS origin', () => {
    const config = loadConfig({})
    expect(config).toMatchObject({
      host: '127.0.0.1',
      port: 3000,
      corsOrigins: [],
      trustProxyHops: 0,
    })
  })

  it('parses overrides', () => {
    const config = loadConfig({
      PORT: '8080',
      HOST: '0.0.0.0',
      CORS_ORIGINS: 'https://a.example, https://b.example',
      TRUST_PROXY_HOPS: '1',
    })
    expect(config.port).toBe(8080)
    expect(config.corsOrigins).toEqual(['https://a.example', 'https://b.example'])
    expect(config.trustProxyHops).toBe(1)
  })

  it.each([
    { PORT: 'abc' },
    { PORT: '70000' },
    { LOG_LEVEL: 'verbose' },
    { TRUST_PROXY_HOPS: 'many' },
    { TRUST_PROXY_HOPS: '99' },
  ])('rejects invalid value %o', (env) => {
    expect(() => loadConfig(env)).toThrow(/Invalid configuration/)
  })
})

describe('TtlCache', () => {
  it('expires entries after the TTL', () => {
    let now = 0
    const cache = new TtlCache<string, number>(10, 100, () => now)
    cache.set('a', 1)
    expect(cache.get('a')).toBe(1)
    now = 101
    expect(cache.get('a')).toBeUndefined()
  })

  it('evicts the oldest entry when full', () => {
    const cache = new TtlCache<string, number>(2, 1_000, () => 0)
    cache.set('a', 1)
    cache.set('b', 2)
    cache.set('c', 3)
    expect(cache.get('a')).toBeUndefined()
    expect(cache.get('b')).toBe(2)
    expect(cache.size).toBe(2)
  })
})
