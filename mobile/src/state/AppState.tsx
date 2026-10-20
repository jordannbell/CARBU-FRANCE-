import * as Crypto from 'expo-crypto'
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { DEVICE_ID_BYTES, bytesToHex, parseDeviceId } from '../logic/deviceId'
import { parseFavorites, toggleFavorite } from '../logic/favorites'
import { DEFAULT_SETTINGS, parseSettings, type Settings } from '../logic/settings'
import { STORAGE_KEYS, deviceStore, secureStore, type KeyValueStore } from '../storage'

interface AppState {
  readonly favoriteIds: readonly number[]
  readonly isFavorite: (id: number) => boolean
  readonly toggleFavorite: (id: number) => void
  readonly settings: Settings
  readonly updateSettings: (patch: Partial<Settings>) => void
  /** False until the saved preferences have been read from the device. */
  readonly loaded: boolean
  /** Anonymous random id of this installation, used to own price alerts. Null until loaded. */
  readonly deviceId: string | null
  /** Erases favourites, settings, cached searches and the device id on this phone. */
  readonly resetLocalData: () => Promise<void>
  /** True when saved preferences could not be read: changes are then not saved, to protect them. */
  readonly loadFailed: boolean
  /** True when the last attempt to save a preference failed. */
  readonly saveFailed: boolean
}

const AppStateContext = createContext<AppState | null>(null)

function newDeviceId(): string {
  return bytesToHex(Crypto.getRandomBytes(DEVICE_ID_BYTES))
}

export function AppStateProvider({
  children,
  store = deviceStore,
  secrets = secureStore,
}: {
  children: ReactNode
  store?: KeyValueStore
  secrets?: KeyValueStore
}) {
  const [favoriteIds, setFavoriteIds] = useState<readonly number[]>([])
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS)
  const [loaded, setLoaded] = useState(false)
  const [deviceId, setDeviceId] = useState<string | null>(null)
  const [loadFailed, setLoadFailed] = useState(false)
  const [saveFailed, setSaveFailed] = useState(false)
  // Latest values, so two quick taps never save from a stale snapshot.
  const latest = useRef({ favoriteIds, settings })
  latest.current = { favoriteIds, settings }
  // A value that could not be read must not be overwritten with defaults by the next change.
  const writable = useRef({ favorites: true, settings: true })

  useEffect(() => {
    let active = true

    async function load(): Promise<void> {
      const [favorites, savedSettings] = await Promise.allSettled([
        store.get(STORAGE_KEYS.favorites),
        store.get(STORAGE_KEYS.settings),
      ])
      if (!active) return
      if (favorites.status === 'fulfilled') setFavoriteIds(parseFavorites(favorites.value))
      else writable.current.favorites = false
      if (savedSettings.status === 'fulfilled') setSettings(parseSettings(savedSettings.value))
      else writable.current.settings = false
      if (favorites.status === 'rejected' || savedSettings.status === 'rejected') {
        setLoadFailed(true)
      }

      // The device id lives in the secure store; an id saved by an older version is moved there.
      const [secret, legacy] = await Promise.allSettled([
        secrets.get(STORAGE_KEYS.deviceId),
        store.get(STORAGE_KEYS.deviceId),
      ])
      if (!active) return
      const known =
        parseDeviceId(secret.status === 'fulfilled' ? secret.value : null) ??
        parseDeviceId(legacy.status === 'fulfilled' ? legacy.value : null)
      const id = known ?? newDeviceId()
      // Kept in memory even if it cannot be saved, so alerts work for this session.
      setDeviceId(id)
      try {
        await secrets.set(STORAGE_KEYS.deviceId, id)
        await store.remove(STORAGE_KEYS.deviceId)
      } catch {
        if (active) setSaveFailed(true)
      }
    }

    load()
      .catch(() => {
        if (active) setLoadFailed(true)
      })
      .finally(() => {
        if (active) setLoaded(true)
      })
    return () => {
      active = false
    }
  }, [store, secrets])

  const persist = useCallback(
    (key: string, value: unknown) => {
      store
        .set(key, JSON.stringify(value))
        .then(() => setSaveFailed(false))
        .catch(() => setSaveFailed(true))
    },
    [store],
  )

  const onToggleFavorite = useCallback(
    (id: number) => {
      // Before the saved list is read, a tap would be overwritten by it.
      if (!loaded) return
      const next = toggleFavorite(latest.current.favoriteIds, id)
      latest.current = { ...latest.current, favoriteIds: next }
      setFavoriteIds(next)
      if (writable.current.favorites) persist(STORAGE_KEYS.favorites, next)
    },
    [loaded, persist],
  )

  const updateSettings = useCallback(
    (patch: Partial<Settings>) => {
      if (!loaded) return
      const next = { ...latest.current.settings, ...patch }
      latest.current = { ...latest.current, settings: next }
      setSettings(next)
      if (writable.current.settings) persist(STORAGE_KEYS.settings, next)
    },
    [loaded, persist],
  )

  const resetLocalData = useCallback(async (): Promise<void> => {
    const freshId = newDeviceId()
    await Promise.all([
      store.remove(STORAGE_KEYS.favorites),
      store.remove(STORAGE_KEYS.settings),
      store.remove(STORAGE_KEYS.searchCache),
      store.remove(STORAGE_KEYS.deviceId),
      secrets.set(STORAGE_KEYS.deviceId, freshId),
    ])
    writable.current = { favorites: true, settings: true }
    latest.current = { favoriteIds: [], settings: DEFAULT_SETTINGS }
    setFavoriteIds([])
    setSettings(DEFAULT_SETTINGS)
    setDeviceId(freshId)
    setLoadFailed(false)
    setSaveFailed(false)
  }, [store, secrets])

  const value = useMemo<AppState>(
    () => ({
      favoriteIds,
      isFavorite: (id) => favoriteIds.includes(id),
      toggleFavorite: onToggleFavorite,
      settings,
      updateSettings,
      loaded,
      deviceId,
      resetLocalData,
      loadFailed,
      saveFailed,
    }),
    [
      favoriteIds,
      settings,
      loaded,
      deviceId,
      loadFailed,
      saveFailed,
      onToggleFavorite,
      updateSettings,
      resetLocalData,
    ],
  )

  return <AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>
}

export function useAppState(): AppState {
  const value = useContext(AppStateContext)
  if (!value) throw new Error('useAppState must be used inside AppStateProvider')
  return value
}
