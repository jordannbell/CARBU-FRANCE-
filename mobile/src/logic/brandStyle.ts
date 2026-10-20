import type { BrandOption } from '../contract'

export type BrandGroup = BrandOption['group']

// Badge backgrounds with white text (contrast checked in tests). The group is shown by colour AND by
// the monogram, so colour is never the only information.
export const BRAND_GROUP_COLORS: Readonly<Record<BrandGroup, string>> = {
  supermarket: '#1D4ED8',
  oil: '#B45309',
  other: '#57534E',
}

/** One or two letters standing for a brand: "E.Leclerc" -> "EL", "TotalEnergies" -> "TE". */
export function brandMonogram(brand: string): string {
  const words = brand
    .replace(/([a-zà-ÿ])([A-Z])/g, '$1 $2')
    .split(/[^A-Za-zÀ-ÿ0-9]+/)
    .filter((word) => word.length > 0)
  const letters = words.map((word) => word.charAt(0).toUpperCase())
  if (letters.length === 0) return '?'
  return letters.slice(0, 2).join('')
}
