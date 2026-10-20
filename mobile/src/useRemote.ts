import { useCallback, useEffect, useRef, useState } from 'react'
import { ApiError, resolveApiUrl, type ApiErrorKind } from './api'

export type RemoteState<T> =
  | { readonly status: 'idle'; readonly data: undefined }
  | { readonly status: 'loading'; readonly data: T | undefined }
  | { readonly status: 'done'; readonly data: T }
  | {
      readonly status: 'error'
      readonly data: T | undefined
      readonly kind: ApiErrorKind
      readonly detail: string
    }

/** What the hook remembers: the outcome of the last request, and which key it answered. */
export interface Stored<T> {
  readonly key: string | null
  readonly state: RemoteState<T>
}

export type Loader<T> = (signal: AbortSignal, baseUrl: string) => Promise<T>

export const EMPTY: Stored<never> = { key: null, state: { status: 'idle', data: undefined } }

/**
 * What a screen may show for `key`. Data that answered another key is never shown: it would be
 * the wrong fuel, the wrong station or the wrong place. Data for the *same* key is kept while it
 * is reloaded or after a failed reload, so pull-to-refresh never blanks the screen.
 */
export function viewFor<T>(stored: Stored<T>, key: string | null): RemoteState<T> {
  if (key === null) return { status: 'idle', data: undefined }
  if (stored.key !== key) return { status: 'loading', data: undefined }
  return stored.state
}

export function startLoading<T>(stored: Stored<T>, key: string): Stored<T> {
  const data = stored.key === key ? stored.state.data : undefined
  return { key, state: { status: 'loading', data } }
}

export function failed<T>(
  stored: Stored<T>,
  key: string,
  error: { kind: ApiErrorKind; detail: string },
): Stored<T> {
  const data = stored.key === key ? stored.state.data : undefined
  return { key, state: { status: 'error', data, kind: error.kind, detail: error.detail } }
}

/**
 * Loads data from the API for a given `key` (null = nothing to load). Only the latest request may
 * update the state, and in-flight requests are aborted when the key changes or on unmount.
 */
export function useRemote<T>(
  key: string | null,
  load: Loader<T>,
): { state: RemoteState<T>; reload: () => void } {
  const [stored, setStored] = useState<Stored<T>>(EMPTY)
  const requestId = useRef(0)
  const controller = useRef<AbortController | null>(null)
  const loadRef = useRef(load)
  loadRef.current = load

  const run = useCallback(() => {
    controller.current?.abort()
    if (key === null) {
      requestId.current += 1
      setStored(EMPTY)
      return
    }
    const abort = new AbortController()
    controller.current = abort
    const current = ++requestId.current
    const isLatest = () => requestId.current === current && !abort.signal.aborted

    setStored((previous) => startLoading(previous, key))

    void (async () => {
      try {
        const baseUrl = resolveApiUrl(process.env.EXPO_PUBLIC_API_URL, __DEV__)
        const data = await loadRef.current(abort.signal, baseUrl)
        if (isLatest()) setStored({ key, state: { status: 'done', data } })
      } catch (error) {
        if (!isLatest()) return
        const kind: ApiErrorKind = error instanceof ApiError ? error.kind : 'server'
        const detail = error instanceof Error ? error.message : 'Unknown error'
        setStored((previous) => failed(previous, key, { kind, detail }))
      }
    })()
  }, [key])

  useEffect(() => {
    run()
    return () => {
      controller.current?.abort()
      requestId.current += 1
    }
  }, [run])

  return { state: viewFor(stored, key), reload: run }
}
