import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { HomeScreen } from './src/HomeScreen'
import { AlertsProvider } from './src/state/Alerts'
import { AppStateProvider } from './src/state/AppState'
import { ThemeProvider } from './src/theme/ThemeProvider'

export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ThemeProvider>
          <AppStateProvider>
            <AlertsProvider>
              <HomeScreen />
            </AlertsProvider>
          </AppStateProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  )
}
