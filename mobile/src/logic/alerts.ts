// Limits shared with the server (backend/src/routes/alerts.ts).
export const MIN_THRESHOLD_EUR = 0.5
export const MAX_THRESHOLD_EUR = 5
export const THRESHOLD_FINE_STEP = 0.01
export const THRESHOLD_COARSE_STEP = 0.05

const roundThousandths = (value: number): number => Math.round(value * 1000) / 1000

export const clampThreshold = (value: number): number =>
  roundThousandths(Math.min(MAX_THRESHOLD_EUR, Math.max(MIN_THRESHOLD_EUR, value)))

/** A sensible first threshold: five cents under the current price, to a whole cent. */
export const suggestThreshold = (currentPrice: number): number =>
  clampThreshold(Math.floor((currentPrice - THRESHOLD_COARSE_STEP) * 100) / 100)

/** Whether the alert is below the current price (otherwise it would fire at once). */
export const isAlreadyReached = (threshold: number, currentPrice: number): boolean =>
  currentPrice <= threshold

/** Moves a threshold by `delta` euros and keeps it inside the allowed range, to the cent. */
export const stepThreshold = (value: number, delta: number): number =>
  clampThreshold(Math.round((value + delta) * 100) / 100)
