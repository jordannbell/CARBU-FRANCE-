import type { StationRepository } from '../db/stationRepository'
import { ingestOnce, type IngestDeps, type IngestResult } from './ingest'

export interface SchedulerLogger {
  info(object: Record<string, unknown>, message: string): void
  error(object: Record<string, unknown>, message: string): void
}

export interface IngestScheduler {
  /** Stops the timer and waits for a run in progress, so the database can be closed safely. */
  stop(): Promise<void>
  /** Runs one ingestion now. Resolves to null when one is already running or when it failed. */
  runOnce(): Promise<IngestResult | null>
}

/**
 * Re-downloads the feed on a fixed interval, so prices stay fresh and the price history fills up.
 * A failed run keeps the previous data and is retried at the next tick; runs never overlap.
 * `onSuccess` (alert evaluation, housekeeping) runs after the data is stored: if it throws, the
 * ingestion still counts as done and the failure is logged on its own.
 */
export function startIngestScheduler(options: {
  repository: StationRepository
  intervalMs: number
  logger: SchedulerLogger
  deps?: IngestDeps
  onSuccess?: (result: IngestResult) => void | Promise<void>
}): IngestScheduler {
  const { repository, intervalMs, logger, deps, onSuccess } = options
  let current: Promise<IngestResult | null> | null = null

  const execute = async (): Promise<IngestResult | null> => {
    let result: IngestResult
    try {
      result = await ingestOnce(repository, {}, deps)
    } catch (error) {
      logger.error({ err: error }, 'ingestion failed; keeping previous data')
      return null
    }
    logger.info({ stored: result.stored, skipped: result.skipped }, 'ingestion done')
    try {
      await onSuccess?.(result)
    } catch (error) {
      logger.error({ err: error }, 'post-ingestion step failed; the new data is stored')
    }
    return result
  }

  const runOnce = async (): Promise<IngestResult | null> => {
    if (current) return null
    current = execute().finally(() => {
      current = null
    })
    return current
  }

  const timer = setInterval(() => void runOnce(), intervalMs)
  timer.unref() // never keeps the process alive on its own

  return {
    stop: async () => {
      clearInterval(timer)
      await current?.catch(() => undefined)
    },
    runOnce,
  }
}
