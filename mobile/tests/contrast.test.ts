import { describe, expect, it } from 'vitest'
import palette from '../src/theme/colors.json'

// WCAG 2.2 relative luminance and contrast ratio.
const channel = (hex: string, start: number): number => {
  const value = parseInt(hex.slice(start, start + 2), 16) / 255
  return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
}
const luminance = (hex: string): number =>
  0.2126 * channel(hex, 1) + 0.7152 * channel(hex, 3) + 0.0722 * channel(hex, 5)
const contrast = (a: string, b: string): number => {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number]
  return (light + 0.05) / (dark + 0.05)
}

type Theme = typeof palette.light
const TEXT_MIN = 4.5

// Every text/background pairing the interface actually uses.
const pairs: readonly (readonly [keyof Theme, keyof Theme])[] = [
  ['text', 'background'],
  ['text', 'surface'],
  ['text', 'surfaceMuted'],
  ['textMuted', 'background'],
  ['textMuted', 'surface'],
  ['textMuted', 'surfaceMuted'],
  ['primaryText', 'primary'],
  ['success', 'surface'],
  ['warning', 'surface'],
  ['danger', 'surface'],
  ['warning', 'warningSurface'],
  ['danger', 'dangerSurface'],
]

describe.each([
  ['light', palette.light],
  ['dark', palette.dark],
] as const)('%s theme contrast (WCAG 2.2 AA)', (_name, theme) => {
  it.each(pairs)('%s on %s reaches 4.5:1', (foreground, background) => {
    expect(contrast(theme[foreground], theme[background])).toBeGreaterThanOrEqual(TEXT_MIN)
  })

  it('exposes the same tokens in both themes', () => {
    expect(Object.keys(theme).sort()).toEqual(Object.keys(palette.light).sort())
  })
})

describe.each([
  ['light', palette.light],
  ['dark', palette.dark],
] as const)('%s theme non-text contrast', (_name, theme) => {
  // WCAG 1.4.11: graphical objects such as the route line need 3:1 against what they sit on.
  it('keeps the route line visible against the surface', () => {
    expect(contrast(theme.route, theme.surface)).toBeGreaterThanOrEqual(3)
  })
})
