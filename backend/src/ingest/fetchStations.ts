export const FUEL_FEED_URL =
  'https://data.economie.gouv.fr/api/explore/v2.1/catalog/datasets/prix-des-carburants-en-france-flux-instantane-v2/exports/json'

const ALLOWED_HOSTS: ReadonlySet<string> = new Set(['data.economie.gouv.fr'])
const FETCH_TIMEOUT_MS = 120_000
const MAX_BODY_BYTES = 64 * 1024 * 1024

function assertAllowedUrl(url: string): void {
  const parsed = new URL(url)
  if (parsed.protocol !== 'https:' || !ALLOWED_HOSTS.has(parsed.hostname)) {
    throw new Error(`Refusing to fetch from untrusted location: ${parsed.origin}`)
  }
}

async function readBoundedText(response: Response, maxBytes: number): Promise<string> {
  const declaredLength = Number(response.headers.get('content-length') ?? 0)
  if (declaredLength > maxBytes) throw new Error('Fuel feed is larger than the allowed size')
  if (!response.body) throw new Error('Fuel feed returned an empty body')

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let received = 0
  let text = ''
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    received += value.byteLength
    if (received > maxBytes) {
      await reader.cancel()
      throw new Error('Fuel feed exceeded the allowed size while downloading')
    }
    text += decoder.decode(value, { stream: true })
  }
  return text + decoder.decode()
}

export async function fetchRawStations(
  fetchImpl: typeof fetch = fetch,
  url: string = FUEL_FEED_URL,
): Promise<readonly unknown[]> {
  assertAllowedUrl(url)
  const response = await fetchImpl(url, {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    redirect: 'error',
  })
  if (!response.ok) throw new Error(`Fuel feed request failed: HTTP ${response.status}`)

  const contentType = response.headers.get('content-type') ?? ''
  if (!contentType.includes('json')) {
    throw new Error(`Fuel feed returned an unexpected content type: ${contentType || 'none'}`)
  }

  const body: unknown = JSON.parse(await readBoundedText(response, MAX_BODY_BYTES))
  if (!Array.isArray(body)) {
    throw new Error('Fuel feed returned an unexpected payload (expected a JSON array)')
  }
  const records: readonly unknown[] = body
  return records
}
