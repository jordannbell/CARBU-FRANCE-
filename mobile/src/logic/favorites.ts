import { z } from 'zod'

export const MAX_FAVORITES = 50

const storedSchema = z.array(z.number().int().positive())

/** Parses what was stored on the device. Anything unexpected is treated as "no favourites". */
export function parseFavorites(raw: string | null): readonly number[] {
  if (!raw) return []
  try {
    const parsed = storedSchema.safeParse(JSON.parse(raw))
    return parsed.success ? [...new Set(parsed.data)].slice(0, MAX_FAVORITES) : []
  } catch {
    return []
  }
}

export function toggleFavorite(ids: readonly number[], id: number): readonly number[] {
  if (ids.includes(id)) return ids.filter((existing) => existing !== id)
  // The newest favourite goes first; the oldest one is dropped at the cap.
  return [id, ...ids].slice(0, MAX_FAVORITES)
}
