import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { buildApp } from './app'
import { loadConfig } from './config'
import { StationRepository } from './db/stationRepository'
import { createExpoPush } from './alerts/push'
import { evaluateAlerts } from './alerts/evaluate'
import { createIgnGeocoder } from './geocoding/ign'
import { brandsNeedRefresh, refreshBrands } from './brands/refresh'
import { startIngestScheduler } from './ingest/scheduler'
import { withDailyBudget } from './routing/budget'
import { withFallback } from './routing/fallback'
import { withGuards } from './routing/guardedRouting'
import { createOrsRouting } from './routing/ors'
import { createOsrmRouting } from './routing/osrm'

const config = loadConfig()

mkdirSync(dirname(config.dbPath), { recursive: true })
const repository = new StationRepository(config.dbPath)

// Route calculation: OpenRouteService first (one quick try and a daily budget under its quota),
// the public OSRM server when it does not answer, and a cache in front of both.
const FAST_ATTEMPT_MS = 5_000
const orsProvider = config.orsApiKey
  ? withDailyBudget(
      createOrsRouting(config.orsApiKey, fetch, undefined, {
        attempts: 1,
        attemptTimeoutMs: FAST_ATTEMPT_MS,
      }),
      { dailyBudget: config.routeDailyBudget },
    )
  : undefined
const osrmProvider = config.routingFallback === 'osrm' ? createOsrmRouting() : undefined
const routingChain =
  orsProvider && osrmProvider
    ? withFallback(orsProvider, osrmProvider, {
        onFallback: (reason) =>
          console.warn(`routing: primary provider failed (${reason}), using OSRM`),
      })
    : (orsProvider ?? osrmProvider)
const routing = routingChain ? withGuards(routingChain) : undefined

const app = await buildApp({
  repository,
  routing,
  geocoder: createIgnGeocoder(),
  alerts: repository.alerts,
  routeRateLimitPerMinute: config.routeRateLimitPerMinute,
  placesRateLimitPerMinute: config.placesRateLimitPerMinute,
  corsOrigins: config.corsOrigins,
  rateLimitPerMinute: config.rateLimitPerMinute,
  trustProxy: config.trustProxyHops > 0 ? config.trustProxyHops : false,
  logLevel: config.logLevel,
})

if (repository.count() === 0) {
  app.log.warn('Database is empty. Run "npm run ingest" to load the official fuel feed.')
}

if (!routing) {
  app.log.warn(
    'No routing provider configured (ORS_API_KEY empty and ROUTING_FALLBACK=none): routes answer 503.',
  )
}

const MS_PER_MINUTE = 60_000
const MS_PER_DAY = 86_400_000
// A device that has not opened the app for this long is forgotten with its alerts.
const DEVICE_RETENTION_DAYS = 180
const scheduler =
  config.ingestIntervalMinutes > 0
    ? startIngestScheduler({
        repository,
        intervalMs: config.ingestIntervalMinutes * MS_PER_MINUTE,
        logger: app.log,
        onSuccess: async () => {
          const now = new Date()
          // Evaluation and housekeeping are independent: one failing must not skip the other.
          try {
            const summary = await evaluateAlerts(
              repository.alerts,
              createExpoPush(fetch, app.log),
              now,
            )
            const level = summary.failed > 0 ? 'warn' : summary.triggered > 0 ? 'info' : 'debug'
            app.log[level](summary, 'price alerts evaluated')
          } catch (error) {
            app.log.error({ err: error }, 'price alert evaluation failed')
          }
        },
      })
    : undefined
if (scheduler && repository.count() === 0) void scheduler.runOnce()

// Retention is a promise made in the privacy policy, so it runs on its own timer: at startup and
// then daily, whether or not the ingestion scheduler is enabled and whatever its outcome.
const MS_PER_HOUR = 3_600_000
function purgeInactiveDevices(): void {
  try {
    const cutoff = new Date(Date.now() - DEVICE_RETENTION_DAYS * MS_PER_DAY)
    const removed = repository.alerts.deleteInactiveDevices(cutoff.toISOString())
    if (removed > 0) app.log.info({ removed }, 'inactive devices removed')
  } catch (error) {
    app.log.error({ err: error }, 'inactive device cleanup failed')
  }
}
// Brands come from OpenStreetMap, once a week. The download is slow and may fail: it never blocks
// startup, and a failure keeps the brands already stored.
let brandRefreshRunning: Promise<void> | null = null
function refreshBrandsIfDue(): void {
  if (!config.brandsRefresh || brandRefreshRunning || !brandsNeedRefresh(repository)) return
  brandRefreshRunning = refreshBrands(repository)
    .then((result) => {
      app.log.info(result, result.replaced ? 'station brands refreshed' : 'station brands kept')
    })
    .catch((error: unknown) => {
      app.log.error({ err: error }, 'station brands refresh failed; keeping previous brands')
    })
    .finally(() => {
      brandRefreshRunning = null
    })
}
refreshBrandsIfDue()
const brandsTimer = setInterval(refreshBrandsIfDue, 6 * 3_600_000)
brandsTimer.unref()

purgeInactiveDevices()
const housekeeping = setInterval(purgeInactiveDevices, 24 * MS_PER_HOUR)
housekeeping.unref()

if (!scheduler) {
  app.log.warn(
    'INGEST_INTERVAL_MINUTES=0: prices are not refreshed automatically, the price history stays empty and price alerts are never evaluated.',
  )
}

let shuttingDown = false
async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return
  shuttingDown = true
  app.log.info({ signal }, 'shutting down')
  clearInterval(housekeeping)
  clearInterval(brandsTimer)
  try {
    await scheduler?.stop()
    await brandRefreshRunning
    await app.close()
  } finally {
    repository.close()
  }
}
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    shutdown(signal)
      .then(() => process.exit(0))
      .catch((error: unknown) => {
        app.log.error({ err: error }, 'shutdown failed')
        process.exit(1)
      })
  })
}

await app.listen({ port: config.port, host: config.host })
