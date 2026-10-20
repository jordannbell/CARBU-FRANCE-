import * as Location from 'expo-location'
import { useCallback, useEffect, useRef, useState } from 'react'

export interface Coordinates {
  readonly latitude: number
  readonly longitude: number
}

// Center of Paris, used when the position is not available.
export const FALLBACK_LOCATION: Coordinates = { latitude: 48.8566, longitude: 2.3522 }
const POSITION_TIMEOUT_MS = 8_000
const LAST_KNOWN_MAX_AGE_MS = 5 * 60_000

export type LocationFallbackCause = 'denied' | 'unavailable'

export type LocationState =
  | { readonly status: 'loading' }
  | { readonly status: 'ready'; readonly coords: Coordinates }
  | {
      readonly status: 'fallback'
      readonly coords: Coordinates
      readonly cause: LocationFallbackCause
      /** False once the OS will no longer show the permission prompt: only Settings can help. */
      readonly canAskAgain: boolean
    }

const fallback = (cause: LocationFallbackCause, canAskAgain: boolean): LocationState => ({
  status: 'fallback',
  coords: FALLBACK_LOCATION,
  cause,
  canAskAgain,
})

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), ms)
    promise.then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      (error: unknown) => {
        clearTimeout(timer)
        reject(error instanceof Error ? error : new Error('location error'))
      },
    )
  })
}

async function resolvePosition(): Promise<LocationState> {
  const permission = await Location.requestForegroundPermissionsAsync()
  if (!permission.granted) return fallback('denied', permission.canAskAgain)

  // A recent cached position is enough for a ~10 km search and avoids waiting for the GPS.
  const lastKnown = await Location.getLastKnownPositionAsync({ maxAge: LAST_KNOWN_MAX_AGE_MS })
  const position =
    lastKnown ??
    (await withTimeout(
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
      POSITION_TIMEOUT_MS,
    ))
  return {
    status: 'ready',
    coords: { latitude: position.coords.latitude, longitude: position.coords.longitude },
  }
}

export function useUserLocation(): { state: LocationState; refresh: () => void } {
  const [state, setState] = useState<LocationState>({ status: 'loading' })
  const requestId = useRef(0)

  const refresh = useCallback(() => {
    const current = ++requestId.current
    setState({ status: 'loading' })
    resolvePosition()
      .catch(() => fallback('unavailable', true))
      .then((next) => {
        if (requestId.current === current) setState(next)
      })
      .catch(() => undefined)
  }, [])

  useEffect(() => {
    refresh()
    return () => {
      requestId.current += 1 // invalidates any in-flight request after unmount
    }
  }, [refresh])

  return { state, refresh }
}
