import { z } from 'zod'
import {
  envelopeSchema,
  alertSchema,
  brandOptionSchema,
  placeSchema,
  priceHistorySchema,
  routeResultSchema,
  stationDetailSchema,
  stationResultSchema,
  tripSchema,
  type AlertView,
  type BrandOption,
  type FuelId,
  type Place,
  type PriceHistory,
  type RouteResult,
  type SortMode,
  type StationDetail,
  type StationResult,
  type Trip,
} from './contract'

const REQUEST_TIMEOUT_MS = 15_000
// The Android emulator reaches the host machine through 10.0.2.2. Development only.
const DEV_FALLBACK_URL = 'http://10.0.2.2:3000'

export type ApiErrorKind =
  | 'network'
  | 'timeout'
  | 'rate-limited'
  | 'unavailable'
  | 'no-route'
  | 'too-far'
  | 'not-found'
  | 'too-many'
  | 'server'
  | 'invalid'

/** Failure of a call to the Carbu API. `detail` is technical text for developers only. */
export class ApiError extends Error {
  constructor(
    readonly kind: ApiErrorKind,
    readonly detail: string,
    options?: { cause?: unknown },
  ) {
    super(detail, options)
    this.name = 'ApiError'
  }
}

const KIND_BY_CODE: Readonly<Record<string, ApiErrorKind>> = {
  RATE_LIMITED: 'rate-limited',
  ROUTING_UNAVAILABLE: 'unavailable',
  ROUTING_BUSY: 'unavailable',
  NO_ROUTE: 'no-route',
  TOO_FAR: 'too-far',
  NOT_FOUND: 'not-found',
  TOO_MANY_ALERTS: 'too-many',
  ALERTS_FULL: 'unavailable',
  ALERTS_UNAVAILABLE: 'unavailable',
  GEOCODING_UNAVAILABLE: 'unavailable',
  GEOCODING_BUSY: 'unavailable',
}

/**
 * Production builds must use HTTPS: requests carry the (rounded) user location.
 * Cleartext is tolerated only in development.
 */
export function resolveApiUrl(configured: string | undefined, isDev: boolean): string {
  const url = configured ?? (isDev ? DEV_FALLBACK_URL : undefined)
  if (!url) throw new Error('EXPO_PUBLIC_API_URL is not set')
  if (!isDev && !url.startsWith('https://')) {
    throw new Error('EXPO_PUBLIC_API_URL must use https:// in production builds')
  }
  return url.replace(/\/+$/, '')
}

type Envelope<T> =
  | { readonly success: true; readonly data: T; readonly meta?: Readonly<Record<string, unknown>> }
  | { readonly success: false; readonly error: { readonly code: string; readonly message: string } }

/**
 * Aborts when the caller aborts or when the timeout elapses, whichever comes first.
 * `timedOut()` is tracked explicitly: React Native's AbortController does not carry a reason,
 * so the cause of an abort cannot be read back from the signal.
 */
function linkedAbort(caller: AbortSignal | undefined, timeoutMs: number) {
  const controller = new AbortController()
  let didTimeOut = false
  const timer = setTimeout(() => {
    didTimeOut = true
    controller.abort()
  }, timeoutMs)
  const onCallerAbort = () => controller.abort()
  if (caller?.aborted) onCallerAbort()
  else caller?.addEventListener('abort', onCallerAbort, { once: true })
  return {
    signal: controller.signal,
    timedOut: () => didTimeOut,
    dispose: () => {
      clearTimeout(timer)
      caller?.removeEventListener('abort', onCallerAbort)
    },
  }
}

interface RequestOptions {
  readonly signal?: AbortSignal
  readonly baseUrl: string
  readonly fetchImpl?: typeof fetch
}

/** Extra HTTP details for calls that are not plain GETs. */
interface CallInit {
  readonly method?: 'GET' | 'POST' | 'PUT' | 'DELETE'
  readonly body?: unknown
  readonly headers?: Readonly<Record<string, string>>
}

/** Calls a path and returns only the data of the envelope. */
async function getData<D extends z.ZodTypeAny>(
  path: string,
  dataSchema: D,
  options: RequestOptions,
  init: CallInit = {},
): Promise<z.infer<D>> {
  return (await getEnvelope(path, dataSchema, options, init)).data
}

/** Calls a path, validates the envelope around `dataSchema`, and turns every failure into an ApiError. */
async function getEnvelope<D extends z.ZodTypeAny>(
  path: string,
  dataSchema: D,
  options: RequestOptions,
  init: CallInit = {},
): Promise<{ data: z.infer<D>; meta: Readonly<Record<string, unknown>> }> {
  const { signal, timedOut, dispose } = linkedAbort(options.signal, REQUEST_TIMEOUT_MS)
  try {
    let response: Response
    try {
      response = await (options.fetchImpl ?? fetch)(`${options.baseUrl}${path}`, {
        signal,
        method: init.method ?? 'GET',
        headers: {
          ...(init.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
          ...init.headers,
        },
        ...(init.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
      })
    } catch (error) {
      if (timedOut()) throw new ApiError('timeout', 'Request timed out', { cause: error })
      // A caller abort keeps its own meaning; the UI ignores it.
      if (signal.aborted) throw error
      throw new ApiError('network', `Server unreachable (${options.baseUrl})`, { cause: error })
    }

    const body: unknown = await response.json().catch(() => null)
    const parsed = envelopeSchema(dataSchema).safeParse(body)
    if (!parsed.success) {
      throw new ApiError('invalid', `Unexpected server response (HTTP ${response.status})`)
    }
    // zod cannot narrow a union built from a generic schema, so the shape is stated explicitly.
    const envelope = parsed.data as Envelope<z.infer<D>>
    if (!envelope.success) {
      throw new ApiError(KIND_BY_CODE[envelope.error.code] ?? 'server', envelope.error.message)
    }
    return { data: envelope.data, meta: envelope.meta ?? {} }
  } finally {
    dispose()
  }
}

const areaMetaSchema = z.object({ total: z.number().int().nonnegative(), truncated: z.boolean() })

/** Part of the map in view. Edges in degrees. */
export interface MapBounds {
  readonly minLatitude: number
  readonly minLongitude: number
  readonly maxLatitude: number
  readonly maxLongitude: number
}

const bboxParam = (b: MapBounds): string =>
  [b.minLatitude, b.minLongitude, b.maxLatitude, b.maxLongitude].map((v) => v.toFixed(4)).join(',')

export interface AreaParams {
  /** Where distances are measured from (the user, or the map centre). */
  readonly latitude: number
  readonly longitude: number
  readonly fuel: FuelId
  readonly sort: SortMode
  readonly bounds: MapBounds
  readonly brands?: readonly string[]
  readonly limit: number
}

export interface AreaPage {
  readonly stations: readonly StationResult[]
  /** Stations matching in the area before the limit cut the list. */
  readonly total: number
  readonly truncated: boolean
}

/** Stations in the part of the map in view. */
export async function searchArea(params: AreaParams, options: RequestOptions): Promise<AreaPage> {
  const query = new URLSearchParams({
    lat: String(params.latitude),
    lon: String(params.longitude),
    fuel: params.fuel,
    sort: params.sort,
    bbox: bboxParam(params.bounds),
    limit: String(params.limit),
  })
  if (params.brands && params.brands.length > 0) query.set('brands', params.brands.join(','))
  const { data, meta } = await getEnvelope(
    `/stations?${query}`,
    z.array(stationResultSchema),
    options,
  )
  const parsed = areaMetaSchema.safeParse(meta)
  if (!parsed.success) throw new ApiError('invalid', 'Unexpected server response (area totals)')
  return { stations: data, total: parsed.data.total, truncated: parsed.data.truncated }
}

export interface TripParams {
  readonly from: { readonly latitude: number; readonly longitude: number }
  readonly to: { readonly latitude: number; readonly longitude: number }
  readonly fuel: FuelId
  readonly sort: SortMode
  readonly brands?: readonly string[]
  readonly limit: number
}

export interface TripPage extends Trip {
  readonly total: number
  readonly truncated: boolean
}

/** Driving route to a destination and the stations along it. */
export async function fetchTrip(params: TripParams, options: RequestOptions): Promise<TripPage> {
  const query = new URLSearchParams({
    lat: String(params.from.latitude),
    lon: String(params.from.longitude),
    toLat: String(params.to.latitude),
    toLon: String(params.to.longitude),
    fuel: params.fuel,
    sort: params.sort,
    limit: String(params.limit),
  })
  if (params.brands && params.brands.length > 0) query.set('brands', params.brands.join(','))
  const { data, meta } = await getEnvelope(`/trip/stations?${query}`, tripSchema, options)
  const parsed = areaMetaSchema.safeParse(meta)
  if (!parsed.success) throw new ApiError('invalid', 'Unexpected server response (trip totals)')
  return { ...data, total: parsed.data.total, truncated: parsed.data.truncated }
}

/** Brands present around a point, for the filter chips. */
export async function fetchBrands(
  params: {
    latitude: number
    longitude: number
    fuel: FuelId
    radiusKm: number
    bounds?: MapBounds
  },
  options: RequestOptions,
): Promise<readonly BrandOption[]> {
  const query = new URLSearchParams({
    lat: String(params.latitude),
    lon: String(params.longitude),
    fuel: params.fuel,
    radiusKm: String(params.radiusKm),
  })
  if (params.bounds) query.set('bbox', bboxParam(params.bounds))
  return getData(`/brands?${query}`, z.array(brandOptionSchema), options)
}

/** Driving route from the user's position to a station of the database. */
export async function fetchRoute(
  stationId: number,
  from: { latitude: number; longitude: number },
  options: RequestOptions,
): Promise<RouteResult> {
  const query = new URLSearchParams({ lat: String(from.latitude), lon: String(from.longitude) })
  return getData(`/stations/${stationId}/route?${query}`, routeResultSchema, options)
}

export async function fetchStationDetail(
  stationId: number,
  options: RequestOptions,
): Promise<StationDetail> {
  return getData(`/stations/${stationId}`, stationDetailSchema, options)
}

export async function fetchPriceHistory(
  stationId: number,
  fuel: FuelId,
  days: number,
  options: RequestOptions,
): Promise<PriceHistory> {
  const query = new URLSearchParams({ fuel, days: String(days) })
  return getData(`/stations/${stationId}/history?${query}`, priceHistorySchema, options)
}

/** Favourites are fetched by id so they stay visible wherever the user is. */
export async function fetchFavoriteStations(
  ids: readonly number[],
  params: { fuel: FuelId; latitude: number; longitude: number },
  options: RequestOptions,
): Promise<readonly StationResult[]> {
  const query = new URLSearchParams({
    ids: ids.join(','),
    fuel: params.fuel,
    lat: String(params.latitude),
    lon: String(params.longitude),
  })
  return getData(`/stations/by-ids?${query}`, z.array(stationResultSchema), options)
}

export async function searchPlaces(
  query: string,
  options: RequestOptions,
): Promise<readonly Place[]> {
  return getData(`/places?${new URLSearchParams({ q: query })}`, z.array(placeSchema), options)
}

const DEVICE_HEADER = 'x-device-id'
const createdSchema = z.object({ id: z.string() })

export async function fetchAlerts(
  deviceId: string,
  options: RequestOptions,
): Promise<readonly AlertView[]> {
  return getData('/alerts', z.array(alertSchema), options, {
    headers: { [DEVICE_HEADER]: deviceId },
  })
}

export async function createAlert(
  deviceId: string,
  alert: { stationId: number; fuel: FuelId; threshold: number; pushToken?: string | null },
  options: RequestOptions,
): Promise<{ id: string }> {
  return getData('/alerts', createdSchema, options, {
    method: 'POST',
    body: alert,
    headers: { [DEVICE_HEADER]: deviceId },
  })
}

export async function deleteAlert(
  deviceId: string,
  alertId: string,
  options: RequestOptions,
): Promise<void> {
  await getData(
    `/alerts/${encodeURIComponent(alertId)}`,
    z.object({ deleted: z.boolean() }),
    options,
    {
      method: 'DELETE',
      headers: { [DEVICE_HEADER]: deviceId },
    },
  )
}

export async function registerPushToken(
  deviceId: string,
  pushToken: string | null,
  options: RequestOptions,
): Promise<void> {
  await getData('/device/push-token', z.object({ registered: z.boolean() }), options, {
    method: 'PUT',
    body: { pushToken },
    headers: { [DEVICE_HEADER]: deviceId },
  })
}

/** Right to be forgotten: removes this device, its push token and all its alerts from the server. */
export async function forgetDevice(deviceId: string, options: RequestOptions): Promise<void> {
  await getData('/device', z.object({ deleted: z.boolean() }), options, {
    method: 'DELETE',
    headers: { [DEVICE_HEADER]: deviceId },
  })
}
