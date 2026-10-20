import type { BrandOption } from '../contract'

const MAX_VISIBLE_BRANDS = 15

/** Brands to show as chips: the ones around, plus any selected brand that is not around here. */
export function chipOptions(
  options: readonly BrandOption[],
  selected: readonly string[],
): readonly BrandOption[] {
  const around = options.slice(0, MAX_VISIBLE_BRANDS)
  const missing = selected
    .filter((brand) => !around.some((option) => option.brand === brand))
    .map((brand): BrandOption => ({ brand, group: 'other', count: 0 }))
  return [...around, ...missing]
}

export function toggleBrand(selected: readonly string[], brand: string): readonly string[] {
  return selected.includes(brand) ? selected.filter((b) => b !== brand) : [...selected, brand]
}

const supermarkets = (options: readonly BrandOption[]): string[] =>
  options.filter((option) => option.group === 'supermarket').map((option) => option.brand)

/** True when every supermarket brand around is selected (and there is at least one). */
export function isSupermarketGroupSelected(
  options: readonly BrandOption[],
  selected: readonly string[],
): boolean {
  const names = supermarkets(options)
  return names.length > 0 && names.every((name) => selected.includes(name))
}

/** Selects all supermarket brands around, or removes them when they were all selected. */
export function toggleSupermarkets(
  options: readonly BrandOption[],
  selected: readonly string[],
): readonly string[] {
  const names = supermarkets(options)
  if (isSupermarketGroupSelected(options, selected)) {
    return selected.filter((brand) => !names.includes(brand))
  }
  return [...selected, ...names.filter((name) => !selected.includes(name))]
}
