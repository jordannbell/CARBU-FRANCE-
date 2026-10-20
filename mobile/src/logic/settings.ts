import { z } from 'zod'

export const TANK_MIN_LITERS = 20
export const TANK_MAX_LITERS = 120
export const TANK_STEP_LITERS = 5

export interface Settings {
  readonly tankLiters: number
  readonly hideStalePrices: boolean
}

export const DEFAULT_SETTINGS: Settings = { tankLiters: 50, hideStalePrices: false }

const storedSchema = z.object({
  tankLiters: z.number().int().min(TANK_MIN_LITERS).max(TANK_MAX_LITERS),
  hideStalePrices: z.boolean(),
})

/** Parses stored settings. A corrupt or out-of-range value falls back to the defaults. */
export function parseSettings(raw: string | null): Settings {
  if (!raw) return DEFAULT_SETTINGS
  try {
    const parsed = storedSchema.safeParse(JSON.parse(raw))
    return parsed.success ? parsed.data : DEFAULT_SETTINGS
  } catch {
    return DEFAULT_SETTINGS
  }
}

export const clampTank = (liters: number): number =>
  Math.min(TANK_MAX_LITERS, Math.max(TANK_MIN_LITERS, Math.round(liters)))
