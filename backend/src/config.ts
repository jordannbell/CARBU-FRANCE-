import { z } from 'zod'

const envSchema = z.object({
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  // Bind locally by default; set HOST=0.0.0.0 only behind a reverse proxy or in a container.
  HOST: z.string().min(1).default('127.0.0.1'),
  DB_PATH: z.string().min(1).default('data/carbu.db'),
  // Comma-separated browser origins allowed by CORS. Empty means no cross-origin browser access.
  CORS_ORIGINS: z.string().default(''),
  RATE_LIMIT_PER_MINUTE: z.coerce.number().int().min(1).max(10_000).default(60),
  // Number of reverse proxies in front of the API (0 = none). Only that many X-Forwarded-For hops
  // are trusted, so a client cannot choose its own IP for rate limiting by forging the header.
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(5).default(0),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'silent']).default('info'),
  // OpenRouteService key. Optional: without it the route endpoint answers 503.
  ORS_API_KEY: z
    .string()
    .trim()
    .optional()
    .transform((value) => (value ? value : undefined)),
  ROUTE_RATE_LIMIT_PER_MINUTE: z.coerce.number().int().min(1).max(1_000).default(10),
  // Maximum upstream route calculations per UTC day, below the provider's free quota.
  ROUTE_DAILY_BUDGET: z.coerce.number().int().min(1).max(1_000_000).default(1_500),
  // Secondary routing service used when OpenRouteService does not answer. "none" disables it.
  ROUTING_FALLBACK: z.enum(['osrm', 'none']).default('osrm'),
  PLACES_RATE_LIMIT_PER_MINUTE: z.coerce.number().int().min(1).max(1_000).default(30),
  // Weekly download of station brands from OpenStreetMap. "false" keeps the brands already stored.
  BRANDS_REFRESH: z.enum(['true', 'false']).default('true'),
  // Minutes between automatic feed refreshes. 0 disables the scheduler (use `npm run ingest`).
  INGEST_INTERVAL_MINUTES: z.coerce
    .number()
    .int()
    .refine((value) => value === 0 || value >= 5, 'must be 0 or at least 5')
    .default(0),
})

export interface Config {
  readonly port: number
  readonly host: string
  readonly dbPath: string
  readonly corsOrigins: readonly string[]
  readonly rateLimitPerMinute: number
  readonly trustProxyHops: number
  readonly logLevel: 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'silent'
  readonly orsApiKey: string | undefined
  readonly routeRateLimitPerMinute: number
  readonly routeDailyBudget: number
  readonly routingFallback: 'osrm' | 'none'
  readonly placesRateLimitPerMinute: number
  readonly brandsRefresh: boolean
  readonly ingestIntervalMinutes: number
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = envSchema.safeParse(env)
  if (!parsed.success) {
    const details = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')
    throw new Error(`Invalid configuration: ${details}`)
  }
  const values = parsed.data
  return {
    port: values.PORT,
    host: values.HOST,
    dbPath: values.DB_PATH,
    corsOrigins: values.CORS_ORIGINS.split(',')
      .map((origin) => origin.trim())
      .filter((origin) => origin.length > 0),
    rateLimitPerMinute: values.RATE_LIMIT_PER_MINUTE,
    trustProxyHops: values.TRUST_PROXY_HOPS,
    logLevel: values.LOG_LEVEL,
    orsApiKey: values.ORS_API_KEY,
    routeRateLimitPerMinute: values.ROUTE_RATE_LIMIT_PER_MINUTE,
    routeDailyBudget: values.ROUTE_DAILY_BUDGET,
    routingFallback: values.ROUTING_FALLBACK,
    placesRateLimitPerMinute: values.PLACES_RATE_LIMIT_PER_MINUTE,
    brandsRefresh: values.BRANDS_REFRESH === 'true',
    ingestIntervalMinutes: values.INGEST_INTERVAL_MINUTES,
  }
}
