import Constants, { ExecutionEnvironment } from 'expo-constants'
import * as Notifications from 'expo-notifications'
import { Platform } from 'react-native'

export type PushRegistration =
  | { readonly status: 'enabled'; readonly token: string }
  | { readonly status: 'denied' }
  /** Remote push cannot work here: Expo Go on Android, or no EAS project id in the app config. */
  | { readonly status: 'unsupported'; readonly reason: 'expo-go-android' | 'missing-project-id' }
  | { readonly status: 'error'; readonly reason: string }

const ALERTS_CHANNEL = 'alerts'

function readProjectId(): string | null {
  const extra: unknown = Constants.expoConfig?.extra
  if (typeof extra === 'object' && extra !== null && 'eas' in extra) {
    const eas = (extra as { eas?: unknown }).eas
    if (typeof eas === 'object' && eas !== null && 'projectId' in eas) {
      const id = (eas as { projectId?: unknown }).projectId
      if (typeof id === 'string' && id.length > 0) return id
    }
  }
  return Constants.easConfig?.projectId ?? null
}

/**
 * Asks for notification permission and returns an Expo push token. Never throws: every failure is
 * reported as a status so the screen can explain it. Price alerts still work without a token
 * (they are shown in the app); a token only adds delivery while the app is closed.
 */
export async function registerForPush(): Promise<PushRegistration> {
  // Expo removed remote push from Expo Go on Android (SDK 53+): a development build is needed.
  if (
    Constants.executionEnvironment === ExecutionEnvironment.StoreClient &&
    Platform.OS === 'android'
  ) {
    return { status: 'unsupported', reason: 'expo-go-android' }
  }
  const projectId = readProjectId()
  if (projectId === null) return { status: 'unsupported', reason: 'missing-project-id' }

  try {
    if (Platform.OS === 'android') {
      // Android 13+ shows no permission prompt before a channel exists.
      await Notifications.setNotificationChannelAsync(ALERTS_CHANNEL, {
        name: 'Alertes de prix',
        importance: Notifications.AndroidImportance.DEFAULT,
      })
    }
    let permission = await Notifications.getPermissionsAsync()
    if (!permission.granted) permission = await Notifications.requestPermissionsAsync()
    if (!permission.granted) return { status: 'denied' }

    const token = await Notifications.getExpoPushTokenAsync({ projectId })
    return { status: 'enabled', token: token.data }
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'unknown error'
    if (__DEV__) console.warn('push registration failed:', reason)
    return { status: 'error', reason }
  }
}
