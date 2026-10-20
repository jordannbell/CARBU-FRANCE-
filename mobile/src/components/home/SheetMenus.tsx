import { StyleSheet, View } from 'react-native'
import { FUEL_IDS, type BrandOption, type FuelId, type SortMode } from '../../contract'
import { fuelLabels } from '../../i18n/fr'
import { FUEL_DOT_COLORS, home } from '../../i18n/home'
import {
  chipOptions,
  isSupermarketGroupSelected,
  toggleBrand,
  toggleSupermarkets,
} from '../../logic/brands'
import { fr } from '../../i18n/fr'
import { Dropdown, DropdownOption } from '../Dropdown'
import { BrandBadge } from './BrandBadge'

const DOT_SIZE = 12

const FuelDot = ({ fuel }: { fuel: FuelId }) => (
  <View accessible={false} style={[styles.dot, { backgroundColor: FUEL_DOT_COLORS[fuel] }]} />
)

/** Fuel choice. The coloured dot is a hint only: the fuel name is always written. */
export function FuelMenu({ fuel, onChange }: { fuel: FuelId; onChange: (fuel: FuelId) => void }) {
  return (
    <Dropdown label={home.fuelMenu} valueLabel={fuelLabels[fuel]} leading={<FuelDot fuel={fuel} />}>
      {(close) =>
        FUEL_IDS.map((id) => (
          <DropdownOption
            key={id}
            label={fuelLabels[id]}
            selected={id === fuel}
            leading={<FuelDot fuel={id} />}
            onPress={() => {
              onChange(id)
              close()
            }}
          />
        ))
      }
    </Dropdown>
  )
}

export function SortMenu({
  sort,
  onChange,
}: {
  sort: SortMode
  onChange: (sort: SortMode) => void
}) {
  const entries: readonly { value: SortMode; label: string }[] = [
    { value: 'price', label: home.sortCheapest },
    { value: 'distance', label: home.sortNearest },
  ]
  const current = entries.find((entry) => entry.value === sort)
  return (
    <Dropdown label={home.sortMenu} valueLabel={current?.label ?? home.sortCheapest}>
      {(close) =>
        entries.map((entry) => (
          <DropdownOption
            key={entry.value}
            label={entry.label}
            selected={entry.value === sort}
            onPress={() => {
              onChange(entry.value)
              close()
            }}
          />
        ))
      }
    </Dropdown>
  )
}

const brandSummary = (selected: readonly string[]): string =>
  selected.length === 0
    ? home.brandMenu
    : selected.length === 1
      ? (selected[0] ?? home.brandMenu)
      : home.brandMenuCount(selected.length)

/** Multi-select brand menu. "Toutes" clears the choice; "Supermarchés" selects that group. */
export function BrandMenu({
  options,
  selected,
  onChange,
}: {
  options: readonly BrandOption[]
  selected: readonly string[]
  onChange: (brands: readonly string[]) => void
}) {
  const entries = chipOptions(options, selected)
  const hasSupermarkets = options.some((option) => option.group === 'supermarket')
  return (
    <Dropdown label={home.brandMenu} valueLabel={brandSummary(selected)}>
      {() => (
        <>
          <DropdownOption
            multiple
            label={fr.brandAll}
            selected={selected.length === 0}
            onPress={() => onChange([])}
          />
          {hasSupermarkets && (
            <DropdownOption
              multiple
              label={fr.brandSupermarkets}
              selected={isSupermarketGroupSelected(options, selected)}
              onPress={() => onChange(toggleSupermarkets(options, selected))}
            />
          )}
          {entries.map((option) => (
            <DropdownOption
              multiple
              key={option.brand}
              label={fr.brandChip(option.brand, option.count)}
              selected={selected.includes(option.brand)}
              leading={<BrandBadge brand={option.brand} group={option.group} size={22} />}
              onPress={() => onChange(toggleBrand(selected, option.brand))}
            />
          ))}
        </>
      )}
    </Dropdown>
  )
}

const styles = StyleSheet.create({
  dot: { width: DOT_SIZE, height: DOT_SIZE, borderRadius: DOT_SIZE / 2 },
})
