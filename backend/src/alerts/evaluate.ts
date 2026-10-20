import { isStale } from '../domain'
import type { PushMessage, PushPort } from './push'
import type { AlertStore, DueAlert } from './store'

export interface EvaluationSummary {
  readonly triggered: number
  readonly notified: number
  readonly rearmed: number
  /** Notifications the push service could not take; those alerts are retried at the next run. */
  readonly failed: number
}

/** An alert fires only on a price that can actually be used: recent, and not out of stock. */
function isBelowThreshold(alert: DueAlert, now: Date): boolean {
  return (
    alert.price !== null &&
    alert.priceUpdatedAt !== null &&
    alert.price <= alert.threshold &&
    !alert.inShortage &&
    !isStale(alert.priceUpdatedAt, now)
  )
}

const formatPrice = (price: number): string => `${price.toFixed(3).replace('.', ',')} €/L`

function toMessage(alert: DueAlert, pushToken: string): PushMessage {
  const where = alert.address ? `${alert.address}${alert.city ? `, ${alert.city}` : ''}` : 'Station'
  return {
    to: pushToken,
    title: 'Alerte de prix',
    body: `${where} : ${formatPrice(alert.price ?? alert.threshold)} (seuil ${formatPrice(alert.threshold)})`,
    data: { stationId: alert.stationId },
  }
}

/**
 * Decides which alerts fire after a price update.
 * - An armed alert fires once when the price drops to the threshold or below.
 * - It re-arms when the price goes back above the threshold, so the next drop notifies again
 *   but a price that stays low does not repeat the notification at every ingestion.
 * - Alerts are marked as triggered even when push is unavailable, so they show up in the app.
 * - When the push service rejects a message (outage), the alert is re-armed so the notification
 *   is retried at the next run instead of being lost.
 */
export async function evaluateAlerts(
  store: AlertStore,
  push: PushPort,
  now: Date,
): Promise<EvaluationSummary> {
  const nowIso = now.toISOString()
  const messages: { alert: DueAlert; message: PushMessage }[] = []
  let triggered = 0
  let rearmed = 0

  for (const alert of store.due()) {
    const below = isBelowThreshold(alert, now)
    if (below && alert.armed) {
      store.markTriggered(alert.id, nowIso)
      triggered += 1
      if (alert.pushToken) messages.push({ alert, message: toMessage(alert, alert.pushToken) })
    } else if (!below && !alert.armed && alert.price !== null && alert.price > alert.threshold) {
      store.rearm(alert.id)
      rearmed += 1
    }
  }

  let notified = 0
  let failed = 0
  if (messages.length > 0) {
    const results = await push.send(messages.map((entry) => entry.message))
    results.forEach((result, index) => {
      const target = messages[index]
      if (!target) return
      if (result.status === 'ok') {
        notified += 1
      } else if (result.status === 'unregistered') {
        store.clearPushToken(target.message.to)
      } else {
        store.rearm(target.alert.id)
        failed += 1
      }
    })
  }
  return { triggered, notified, rearmed, failed }
}
