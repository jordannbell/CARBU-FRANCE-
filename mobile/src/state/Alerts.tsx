import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { AppState as ForegroundState } from 'react-native'
import {
  ApiError,
  createAlert,
  deleteAlert,
  fetchAlerts,
  forgetDevice,
  registerPushToken,
  resolveApiUrl,
} from '../api'
import type { AlertView, FuelId } from '../contract'
import { registerForPush, type PushRegistration } from '../push'
import { useRemote } from '../useRemote'
import { useAppState } from './AppState'

export type PushStatus =
  'unknown' | PushRegistration['status'] | 'unsupported-expo-go-android' | 'unsupported-no-project'

export type AlertActionError = 'too-many' | 'failed' | 'forget-failed' | null

interface AlertsState {
  /** False until the device id exists, so alerts cannot be created before it. */
  readonly ready: boolean
  readonly alerts: readonly AlertView[]
  readonly loading: boolean
  readonly loadFailed: boolean
  readonly pushStatus: PushStatus
  readonly actionError: AlertActionError
  readonly create: (stationId: number, fuel: FuelId, threshold: number) => Promise<boolean>
  readonly remove: (alertId: string) => Promise<void>
  /** Right to be forgotten: erases this device from the server, then everything stored locally. */
  readonly forgetMe: () => Promise<boolean>
  readonly reload: () => void
  readonly alertFor: (stationId: number, fuel: FuelId) => AlertView | undefined
  /** Alerts whose station is at or under the threshold right now. */
  readonly triggered: readonly AlertView[]
}

const AlertsContext = createContext<AlertsState | null>(null)

function toPushStatus(result: PushRegistration): PushStatus {
  if (result.status === 'unsupported') {
    return result.reason === 'expo-go-android'
      ? 'unsupported-expo-go-android'
      : 'unsupported-no-project'
  }
  return result.status
}

export function AlertsProvider({ children }: { children: ReactNode }) {
  const { deviceId, resetLocalData } = useAppState()
  const [pushStatus, setPushStatus] = useState<PushStatus>('unknown')
  const [pushToken, setPushToken] = useState<string | null>(null)
  const [actionError, setActionError] = useState<AlertActionError>(null)

  const { state, reload } = useRemote<readonly AlertView[]>(
    deviceId ? `alerts|${deviceId}` : null,
    (signal, baseUrl) => {
      if (!deviceId) throw new Error('device id not ready')
      return fetchAlerts(deviceId, { signal, baseUrl })
    },
  )

  // Prices move while the app sleeps: refresh when the user comes back.
  useEffect(() => {
    const subscription = ForegroundState.addEventListener('change', (next) => {
      if (next === 'active') reload()
    })
    return () => subscription.remove()
  }, [reload])

  const baseUrl = useCallback(() => resolveApiUrl(process.env.EXPO_PUBLIC_API_URL, __DEV__), [])

  /**
   * Asks for permission once and tells the server about the token so it can notify a closed app.
   * The token is remembered only once the server has accepted it, so a failure is retried the
   * next time instead of leaving older alerts without push while the screen says "enabled".
   */
  const ensurePush = useCallback(async (): Promise<string | null> => {
    if (pushToken) return pushToken
    const result = await registerForPush()
    setPushStatus(toPushStatus(result))
    if (result.status !== 'enabled') return null
    if (deviceId) {
      try {
        await registerPushToken(deviceId, result.token, { baseUrl: baseUrl() })
        setPushToken(result.token)
      } catch (error) {
        if (__DEV__) console.warn('push token registration failed', error)
        // Not remembered: the next alert retries. This alert still carries the token itself.
      }
    }
    return result.token
  }, [pushToken, deviceId, baseUrl])

  const create = useCallback(
    async (stationId: number, fuel: FuelId, threshold: number): Promise<boolean> => {
      if (!deviceId) return false
      setActionError(null)
      try {
        const token = await ensurePush()
        await createAlert(
          deviceId,
          { stationId, fuel, threshold, pushToken: token },
          { baseUrl: baseUrl() },
        )
        reload()
        return true
      } catch (error) {
        setActionError(
          error instanceof ApiError && error.kind === 'too-many' ? 'too-many' : 'failed',
        )
        return false
      }
    },
    [deviceId, ensurePush, baseUrl, reload],
  )

  const remove = useCallback(
    async (alertId: string): Promise<void> => {
      if (!deviceId) return
      setActionError(null)
      try {
        await deleteAlert(deviceId, alertId, { baseUrl: baseUrl() })
        reload()
      } catch {
        setActionError('failed')
      }
    },
    [deviceId, baseUrl, reload],
  )

  const forgetMe = useCallback(async (): Promise<boolean> => {
    if (!deviceId) return false
    setActionError(null)
    try {
      // Server first: if it cannot be reached, nothing is erased and the user can try again.
      await forgetDevice(deviceId, { baseUrl: baseUrl() })
      await resetLocalData()
      setPushToken(null)
      setPushStatus('unknown')
      return true
    } catch {
      setActionError('forget-failed')
      return false
    }
  }, [deviceId, baseUrl, resetLocalData])

  const alerts = useMemo(() => state.data ?? [], [state.data])
  const value = useMemo<AlertsState>(
    () => ({
      ready: deviceId !== null,
      alerts,
      loading: state.status === 'loading',
      loadFailed: state.status === 'error',
      pushStatus,
      actionError,
      create,
      remove,
      forgetMe,
      reload,
      alertFor: (stationId, fuel) =>
        alerts.find((alert) => alert.stationId === stationId && alert.fuel === fuel),
      triggered: alerts.filter(
        (alert) =>
          alert.triggeredAt !== null &&
          alert.currentPrice !== null &&
          alert.currentPrice <= alert.threshold &&
          alert.stale !== true,
      ),
    }),
    [deviceId, alerts, state.status, pushStatus, actionError, create, remove, forgetMe, reload],
  )

  return <AlertsContext.Provider value={value}>{children}</AlertsContext.Provider>
}

export function useAlerts(): AlertsState {
  const value = useContext(AlertsContext)
  if (!value) throw new Error('useAlerts must be used inside AlertsProvider')
  return value
}
