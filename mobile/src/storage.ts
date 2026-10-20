import AsyncStorage from '@react-native-async-storage/async-storage'
import * as SecureStore from 'expo-secure-store'

/** Minimal key-value storage so logic and hooks can be tested without a device. */
export interface KeyValueStore {
  get(key: string): Promise<string | null>
  set(key: string, value: string): Promise<void>
  remove(key: string): Promise<void>
}

export const deviceStore: KeyValueStore = {
  get: (key) => AsyncStorage.getItem(key),
  set: (key, value) => AsyncStorage.setItem(key, value),
  remove: (key) => AsyncStorage.removeItem(key),
}

/**
 * Keychain (iOS) / Keystore-backed storage (Android) for the one secret of the app: the device id
 * that owns the price alerts. Unlike AsyncStorage it is not readable from a plain file backup.
 */
export const secureStore: KeyValueStore = {
  get: (key) => SecureStore.getItemAsync(key),
  set: (key, value) => SecureStore.setItemAsync(key, value),
  remove: (key) => SecureStore.deleteItemAsync(key),
}

export const STORAGE_KEYS = {
  favorites: 'carbu:favorites:v1',
  deviceId: 'carbu:device-id:v1',
  settings: 'carbu:settings:v1',
  searchCache: 'carbu:search-cache:v1',
} as const
