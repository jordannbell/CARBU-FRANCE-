import { describe, expect, it } from 'vitest'
import { withGuards } from '../src/routing/guardedRouting'
import { createOrsRouting } from '../src/routing/ors'
import { simplifyPath } from '../src/routing/simplify'
import { RoutingError, type RouteResult, type RoutingPort } from '../src/routing/types'

const PARIS = { latitude: 48.8566, longitude: 2.3522 }
const NEAR = { latitude: 48.87, longitude: 2.37 }

const orsBody = {
  features: [
    {
      geometry: {
        coordinates: [
          [2.3522, 48.8566, 35],
          [2.36, 48.862],
          [2.37, 48.87],
        ],
      },
      properties: { summary: { distance: 2345.6, duration: 412.4 } },
    },
  ],
}

const json =
  (body: unknown, status = 200) =>
  async () =>
    new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

describe('createOrsRouting', () => {
  it('returns distance, duration and a [lat, lon] path', async () => {
    const route = await createOrsRouting('key', json(orsBody)).getRoute(PARIS, NEAR)
    expect(route.distanceMeters).toBe(2346)
    expect(route.durationSeconds).toBe(412)
    expect(route.path[0]).toEqual({ latitude: 48.8566, longitude: 2.3522 })
    expect(route.path.at(-1)).toEqual({ latitude: 48.87, longitude: 2.37 })
  })

  it('sends the key in the Authorization header and coordinates as [lon, lat]', async () => {
    let captured: { headers: Headers; body: unknown } | undefined
    const spy: typeof fetch = async (_input, init) => {
      captured = {
        headers: new Headers(init?.headers),
        body: JSON.parse(typeof init?.body === 'string' ? init.body : '{}'),
      }
      return new Response(JSON.stringify(orsBody))
    }
    await createOrsRouting('secret-key', spy).getRoute(PARIS, NEAR)
    expect(captured?.headers.get('authorization')).toBe('secret-key')
    expect(captured?.body).toMatchObject({
      coordinates: [
        [2.3522, 48.8566],
        [2.37, 48.87],
      ],
    })
  })

  it.each([
    [429, 'busy'],
    [404, 'no-route'],
    [400, 'no-route'],
    [401, 'failed'],
    [403, 'failed'],
    [500, 'failed'],
  ])('maps provider HTTP %i to %s', async (status, kind) => {
    await expect(
      createOrsRouting('k', json({}, status)).getRoute(PARIS, NEAR),
    ).rejects.toMatchObject({
      kind,
    })
  })

  it('fails on a malformed provider response', async () => {
    await expect(
      createOrsRouting('k', json({ features: [] })).getRoute(PARIS, NEAR),
    ).rejects.toMatchObject({ kind: 'failed' })
  })

  it('fails when the provider is unreachable and hides the key from the error', async () => {
    const down: typeof fetch = async () => {
      throw new TypeError('connect ECONNREFUSED')
    }
    const error = await createOrsRouting('secret-key', down)
      .getRoute(PARIS, NEAR)
      .catch((e: unknown) => e)
    expect(error).toBeInstanceOf(RoutingError)
    expect(String((error as Error).message)).not.toContain('secret-key')
  })
})

describe('simplifyPath', () => {
  it('keeps the endpoints and drops collinear points', () => {
    const straight = Array.from({ length: 50 }, (_, i) => ({
      latitude: 48 + i * 0.001,
      longitude: 2,
    }))
    const result = simplifyPath(straight)
    expect(result).toHaveLength(2)
    expect(result[0]).toEqual(straight[0])
    expect(result.at(-1)).toEqual(straight.at(-1))
  })

  it('keeps a real corner', () => {
    const corner = [
      { latitude: 48, longitude: 2 },
      { latitude: 48.01, longitude: 2 },
      { latitude: 48.01, longitude: 2.01 },
    ]
    expect(simplifyPath(corner)).toHaveLength(3)
  })

  it('handles a very long path without overflowing the stack', () => {
    const long = Array.from({ length: 40_000 }, (_, i) => ({
      latitude: 48 + Math.sin(i / 50) * 0.01,
      longitude: 2 + i * 0.00001,
    }))
    expect(simplifyPath(long).length).toBeLessThan(long.length)
  })
})

describe('withGuards', () => {
  const route: RouteResult = { distanceMeters: 1, durationSeconds: 1, path: [PARIS, NEAR] }

  it('rejects destinations farther than 150 km before calling the provider', async () => {
    let calls = 0
    const provider: RoutingPort = {
      getRoute: async () => {
        calls += 1
        return route
      },
    }
    const lyon = { latitude: 45.764, longitude: 4.8357 }
    await expect(withGuards(provider).getRoute(PARIS, lyon)).rejects.toMatchObject({
      kind: 'too-far',
    })
    expect(calls).toBe(0)
  })

  it('serves repeated nearby requests from the cache', async () => {
    let calls = 0
    const provider: RoutingPort = {
      getRoute: async () => {
        calls += 1
        return route
      },
    }
    const guarded = withGuards(provider)
    await guarded.getRoute({ latitude: 48.85661, longitude: 2.35221 }, NEAR)
    await guarded.getRoute({ latitude: 48.85664, longitude: 2.35224 }, NEAR)
    expect(calls).toBe(1)
  })

  it('shares one upstream call between concurrent identical requests', async () => {
    let calls = 0
    const provider: RoutingPort = {
      getRoute: async () => {
        calls += 1
        await new Promise((resolve) => setTimeout(resolve, 10))
        return route
      },
    }
    const guarded = withGuards(provider)
    await Promise.all([guarded.getRoute(PARIS, NEAR), guarded.getRoute(PARIS, NEAR)])
    expect(calls).toBe(1)
  })

  it('does not cache failures', async () => {
    let calls = 0
    const provider: RoutingPort = {
      getRoute: async () => {
        calls += 1
        throw new RoutingError('failed', 'boom')
      },
    }
    const guarded = withGuards(provider)
    await expect(guarded.getRoute(PARIS, NEAR)).rejects.toBeInstanceOf(RoutingError)
    await expect(guarded.getRoute(PARIS, NEAR)).rejects.toBeInstanceOf(RoutingError)
    expect(calls).toBe(2)
  })
})
