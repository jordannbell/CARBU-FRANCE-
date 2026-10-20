import { createContext, useContext, useMemo, type ReactNode } from 'react'
import { useColorScheme } from 'react-native'
import { darkColors, lightColors, type ColorTokens } from './tokens'

const ThemeContext = createContext<ColorTokens>(lightColors)

export function ThemeProvider({ children }: { children: ReactNode }) {
  const scheme = useColorScheme()
  const colors = useMemo(() => (scheme === 'dark' ? darkColors : lightColors), [scheme])
  return <ThemeContext.Provider value={colors}>{children}</ThemeContext.Provider>
}

export const useColors = (): ColorTokens => useContext(ThemeContext)
