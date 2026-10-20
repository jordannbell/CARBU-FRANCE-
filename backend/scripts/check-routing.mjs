// Diagnostic: calls OpenRouteService once with the key from .env and reports status and timing.
// Never prints the key. Run with: npm run check:routing
const key = process.env.ORS_API_KEY ?? ''
if (key.length === 0) {
  console.error('ORS_API_KEY is empty. Copy .env.example to .env and fill it in.')
  process.exit(1)
}

const URL = 'https://api.heigit.org/openrouteservice/v2/directions/driving-car/geojson'
const TIMEOUT_MS = 30_000
const started = Date.now()

try {
  const response = await fetch(URL, {
    method: 'POST',
    headers: {
      Authorization: key,
      'Content-Type': 'application/json',
      Accept: 'application/geo+json',
    },
    body: JSON.stringify({
      coordinates: [
        [2.3522, 48.8566],
        [2.37, 48.87],
      ],
      instructions: false,
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  })
  const elapsed = Date.now() - started
  const body = await response.json().catch(() => null)
  const summary = body?.features?.[0]?.properties?.summary
  if (response.ok && summary) {
    console.log(
      `OK in ${elapsed} ms: ${Math.round(summary.distance)} m, ${Math.round(summary.duration)} s`,
    )
  } else {
    console.error(`HTTP ${response.status} in ${elapsed} ms`, JSON.stringify(body)?.slice(0, 300))
    process.exitCode = 1
  }
} catch (error) {
  console.error(
    `No answer after ${Date.now() - started} ms:`,
    error instanceof Error ? error.name : error,
  )
  process.exitCode = 1
}
