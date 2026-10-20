import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { z } from 'zod'
import {
  MAX_ALERTS_PER_DEVICE,
  MAX_ALERTS_TOTAL,
  MAX_DEVICES,
  type AlertStore,
} from '../alerts/store'
import { PUSH_TOKEN_PATTERN } from '../alerts/push'
import { FUEL_TYPES, isStale, type StationReader } from '../domain'
import { fail, ok } from '../http'

const MIN_THRESHOLD_EUR = 0.5
const MAX_THRESHOLD_EUR = 5

// The device id is a random secret generated on the phone. It is the only credential: whoever
// knows it can read and delete that device's alerts, so it travels in a header, never in a URL.
const deviceIdSchema = z.string().regex(/^[a-f0-9]{32,64}$/)
const pushTokenSchema = z.string().regex(PUSH_TOKEN_PATTERN)

const createBodySchema = z.object({
  stationId: z.number().int().positive(),
  fuel: z.enum(FUEL_TYPES),
  threshold: z.number().min(MIN_THRESHOLD_EUR).max(MAX_THRESHOLD_EUR),
  pushToken: pushTokenSchema.nullish(),
})
const pushTokenBodySchema = z.object({ pushToken: pushTokenSchema.nullable() })
const alertParamsSchema = z.object({ id: z.string().uuid() })

const roundCents = (value: number): number => Math.round(value * 1000) / 1000

/** Reads the device id; answers 401 itself and returns null when it is missing or malformed. */
function requireDevice(request: FastifyRequest, reply: FastifyReply): string | null {
  const parsed = deviceIdSchema.safeParse(request.headers['x-device-id'])
  if (parsed.success) return parsed.data
  void reply.code(401).send(fail('DEVICE_REQUIRED', 'A valid device id is required'))
  return null
}

export function registerAlertRoutes(
  app: FastifyInstance,
  deps: {
    alerts: AlertStore | undefined
    repository: StationReader
    rateLimitPerMinute: number
    now: () => Date
  },
): void {
  const { alerts, repository, rateLimitPerMinute, now } = deps
  const limited = { config: { rateLimit: { max: rateLimitPerMinute, timeWindow: '1 minute' } } }

  const unavailable = (reply: FastifyReply) =>
    reply.code(503).send(fail('ALERTS_UNAVAILABLE', 'Price alerts are not available'))

  app.post('/alerts', limited, (request, reply) => {
    if (!alerts) return unavailable(reply)
    const deviceId = requireDevice(request, reply)
    if (!deviceId) return reply
    const body = createBodySchema.safeParse(request.body)
    if (!body.success) return reply.code(400).send(fail('INVALID_BODY', 'Invalid alert'))

    const { stationId, fuel, pushToken } = body.data
    const threshold = roundCents(body.data.threshold)
    if (!repository.findById(stationId)) {
      return reply.code(404).send(fail('NOT_FOUND', 'Station not found'))
    }
    // Changing the threshold of an existing alert never counts against the limit.
    if (
      !alerts.exists(deviceId, stationId, fuel) &&
      alerts.count(deviceId) >= MAX_ALERTS_PER_DEVICE
    ) {
      return reply
        .code(409)
        .send(fail('TOO_MANY_ALERTS', `At most ${MAX_ALERTS_PER_DEVICE} alerts per device`))
    }

    const isNewDevice = !alerts.deviceExists(deviceId)
    if (
      (isNewDevice && alerts.deviceCount() >= MAX_DEVICES) ||
      alerts.totalAlerts() >= MAX_ALERTS_TOTAL
    ) {
      return reply.code(503).send(fail('ALERTS_FULL', 'Price alerts are temporarily full'))
    }

    const nowIso = now().toISOString()
    alerts.ensureDevice(deviceId, pushToken, nowIso)
    const id = alerts.upsert(deviceId, stationId, fuel, threshold, nowIso)
    return reply.code(201).send(ok({ id }))
  })

  app.get('/alerts', limited, (request, reply) => {
    if (!alerts) return unavailable(reply)
    const deviceId = requireDevice(request, reply)
    if (!deviceId) return reply
    const currentTime = now()
    alerts.touch(deviceId, currentTime.toISOString())
    reply.header('Cache-Control', 'private, no-store')
    return ok(
      alerts.list(deviceId).map((alert) => ({
        ...alert,
        stale: alert.priceUpdatedAt ? isStale(alert.priceUpdatedAt, currentTime) : null,
      })),
    )
  })

  app.delete('/alerts/:id', limited, (request, reply) => {
    if (!alerts) return unavailable(reply)
    const deviceId = requireDevice(request, reply)
    if (!deviceId) return reply
    const params = alertParamsSchema.safeParse(request.params)
    if (!params.success) return reply.code(400).send(fail('INVALID_ID', 'Invalid alert id'))
    // The device scope makes someone else's alert indistinguishable from a missing one.
    if (!alerts.delete(deviceId, params.data.id)) {
      return reply.code(404).send(fail('NOT_FOUND', 'Alert not found'))
    }
    return ok({ deleted: true })
  })

  app.put('/device/push-token', limited, (request, reply) => {
    if (!alerts) return unavailable(reply)
    const deviceId = requireDevice(request, reply)
    if (!deviceId) return reply
    const body = pushTokenBodySchema.safeParse(request.body)
    if (!body.success) return reply.code(400).send(fail('INVALID_BODY', 'Invalid push token'))
    alerts.setPushToken(deviceId, body.data.pushToken, now().toISOString())
    return ok({ registered: body.data.pushToken !== null })
  })

  // Right to be forgotten: removes the device, its push token and all its alerts.
  app.delete('/device', limited, (request, reply) => {
    if (!alerts) return unavailable(reply)
    const deviceId = requireDevice(request, reply)
    if (!deviceId) return reply
    alerts.deleteDevice(deviceId)
    return ok({ deleted: true })
  })
}
