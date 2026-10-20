export type BrandGroup = 'supermarket' | 'oil' | 'other'

export interface Brand {
  readonly name: string
  readonly group: BrandGroup
}

const MAX_BRAND_LENGTH = 40

// Values that say "no brand" rather than naming one.
const PLACEHOLDERS: ReadonlySet<string> = new Set([
  'independent',
  'independant',
  'station service',
  'station-service',
  'gas station',
  'fuel',
  'sans enseigne',
  'inconnu',
  'unknown',
  'no name',
  'none',
  'yes',
  'no',
])

/** Spelling variants of the same brand, as seen in OpenStreetMap, folded to one name. */
const KNOWN: readonly { pattern: RegExp; brand: Brand }[] = [
  { pattern: /^total(?:energies?)?(?: .*)?$/, brand: { name: 'TotalEnergies', group: 'oil' } },
  { pattern: /^(?:e ?)?leclerc(?: .*)?$/, brand: { name: 'E.Leclerc', group: 'supermarket' } },
  { pattern: /^carrefour(?: .*)?$/, brand: { name: 'Carrefour', group: 'supermarket' } },
  {
    pattern: /^(?:intermarche|groupement des mousquetaires)(?: .*)?$/,
    brand: { name: 'Intermarché', group: 'supermarket' },
  },
  {
    pattern: /^(?:u|systeme u|super u|hyper u|la station u|station u|marche u|u express)(?: .*)?$/,
    brand: { name: 'Système U', group: 'supermarket' },
  },
  { pattern: /^auchan(?: .*)?$/, brand: { name: 'Auchan', group: 'supermarket' } },
  { pattern: /^(?:casino|geant)(?: .*)?$/, brand: { name: 'Casino', group: 'supermarket' } },
  { pattern: /^cora(?: .*)?$/, brand: { name: 'Cora', group: 'supermarket' } },
  { pattern: /^netto(?: .*)?$/, brand: { name: 'Netto', group: 'supermarket' } },
  { pattern: /^esso(?: .*)?$/, brand: { name: 'Esso', group: 'oil' } },
  { pattern: /^bp(?: .*)?$/, brand: { name: 'BP', group: 'oil' } },
  { pattern: /^shell(?: .*)?$/, brand: { name: 'Shell', group: 'oil' } },
  { pattern: /^avia(?: .*)?$/, brand: { name: 'Avia', group: 'oil' } },
  { pattern: /^(?:eni|agip)(?: .*)?$/, brand: { name: 'Eni', group: 'oil' } },
  { pattern: /^elan(?: .*)?$/, brand: { name: 'Elan', group: 'oil' } },
  { pattern: /^dyneff(?: .*)?$/, brand: { name: 'Dyneff', group: 'oil' } },
  { pattern: /^oil(?: .*)?$/, brand: { name: 'OIL!', group: 'oil' } },
]

/** Group of an already-normalised brand name, for filters such as "supermarkets". */
export function groupOf(brandName: string): BrandGroup {
  return KNOWN.find((entry) => entry.brand.name === brandName)?.brand.group ?? 'other'
}

/** Lowercase, no accents, no punctuation: "É.Leclerc Express" -> "e leclerc express". */
const fold = (value: string): string =>
  value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()

/**
 * Turns the brand text found on a map into a stable name to filter on. Returns null when the text
 * is empty or only says "no brand". Unknown brands are kept as typed, so a small regional brand
 * still appears instead of being dropped.
 */
export function normalizeBrand(raw: string | undefined | null): Brand | null {
  const text = (raw ?? '').trim().replace(/\s+/g, ' ')
  if (text.length === 0) return null
  const folded = fold(text)
  if (folded.length === 0 || PLACEHOLDERS.has(folded)) return null

  const known = KNOWN.find((entry) => entry.pattern.test(folded))
  if (known) return known.brand
  return { name: text.slice(0, MAX_BRAND_LENGTH), group: 'other' }
}
