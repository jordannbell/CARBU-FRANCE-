import { z } from 'zod'

// Fixed endpoint: never built from user input.
export const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send'

const REQUEST_TIMEOUT_MS = 10_000
const BATCH_SIZE = 100 // Expo accepts at most 100 messages per request
const MAX_BODY_BYTES = 1024 * 1024

/** Matches the tokens produced by expo-notifications: ExponentPushToken[...] / ExpoPushToken[...]. */
export const PUSH_TOKEN_PATTERN = /^Expo(nent)?PushToken\[[A-Za-z0-9_-]{10,200}\]$/

export interface PushMessage {
  readonly to: string
  readonly title: string
  readonly body: string
  readonly data: { readonly stationId: number }
}

export type PushResult =
  | { readonly status: 'ok' }
  /** The token no longer exists (app uninstalled): it must not be used again. */
  | { readonly status: 'unregistered' }
  | { readonly status: 'failed' }

/** Receives diagnostic details. Never given tokens or message content. */
export interface PushLogger {
  warn(object: Record<string, unknown>, message: string): void
}

export interface PushPort {
  /** Sends the messages and answers one result per message, in the same order. */
  send(messages: readonly PushMessage[]): Promise<readonly PushResult[]>
}

const ticketSchema = z.object({
  data: z.array(
    z.object({
      status: z.enum(['ok', 'error']),
      details: z.object({ error: z.string().optional() }).optional(),
    }),
  ),
})

async function sendBatch(
  fetchImpl: typeof fetch,
  batch: readonly PushMessage[],
  logger: PushLogger | undefined,
): Promise<readonly PushResult[]> {
  const failed = batch.map((): PushResult => ({ status: 'failed' }))
  const fail = (reason: string, extra: Record<string, unknown> = {}) => {
    logger?.warn({ reason, batchSize: batch.length, ...extra }, 'push batch failed')
    return failed
  }
  try {
    const response = await fetchImpl(EXPO_PUSH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(batch),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      redirect: 'error',
    })
    if (!response.ok) return fail('http-error', { status: response.status })
    const text = await response.text()
    if (text.length > MAX_BODY_BYTES) return fail('response-too-large')
    const tickets = ticketSchema.safeParse(JSON.parse(text))
    if (!tickets.success || tickets.data.data.length !== batch.length) {
      return fail('unexpected-response')
    }

    return tickets.data.data.map((ticket): PushResult => {
      if (ticket.status === 'ok') return { status: 'ok' }
      return ticket.details?.error === 'DeviceNotRegistered'
        ? { status: 'unregistered' }
        : { status: 'failed' }
    })
  } catch (error) {
    return fail('request-error', { error: error instanceof Error ? error.name : 'unknown' })
  }
}

export function createExpoPush(fetchImpl: typeof fetch = fetch, logger?: PushLogger): PushPort {
  return {
    async send(messages) {
      const results: PushResult[] = []
      for (let start = 0; start < messages.length; start += BATCH_SIZE) {
        results.push(
          ...(await sendBatch(fetchImpl, messages.slice(start, start + BATCH_SIZE), logger)),
        )
      }
      return results
    },
  }
}
