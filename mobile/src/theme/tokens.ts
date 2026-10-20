// Design tokens for Carbu France. Colors live in colors.json (the single source of truth, also
// read by the contrast test); spacing, radius and type roles are defined here.
import type { TextStyle } from 'react-native'
import palette from './colors.json'

export interface ColorTokens {
  readonly background: string
  readonly surface: string
  readonly surfaceMuted: string
  readonly border: string
  readonly text: string
  readonly textMuted: string
  readonly primary: string
  readonly primaryText: string
  readonly success: string
  readonly warning: string
  readonly warningSurface: string
  readonly danger: string
  readonly dangerSurface: string
  readonly route: string
}

export const lightColors: ColorTokens = palette.light
export const darkColors: ColorTokens = palette.dark

// 4/8 grid.
export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const

export const radius = { sm: 8, md: 12, lg: 16, pill: 999 } as const

export type TypeRole = 'title' | 'price' | 'body' | 'bodyStrong' | 'label' | 'caption'

// Modular scale: 12 / 14 / 16 / 24 / 28. Body 16 with 1.5 line height, headings tighter.
export const typography: Readonly<Record<TypeRole, TextStyle>> = {
  title: { fontSize: 28, lineHeight: 34, fontWeight: '700', letterSpacing: -0.4 },
  price: { fontSize: 24, lineHeight: 28, fontWeight: '700', fontVariant: ['tabular-nums'] },
  body: { fontSize: 16, lineHeight: 24, fontWeight: '400' },
  bodyStrong: { fontSize: 16, lineHeight: 24, fontWeight: '600' },
  label: { fontSize: 14, lineHeight: 20, fontWeight: '600' },
  caption: { fontSize: 12, lineHeight: 16, fontWeight: '400' },
}

// Minimum touch target: 44 pt (iOS) / 48 dp (Android).
export const MIN_TOUCH_TARGET = 48

// Row height reserved by list rows and their loading skeletons, so nothing shifts on load.
export const ROW_MIN_HEIGHT = 76
