import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { loadConfig } from '../config'
import { StationRepository } from '../db/stationRepository'
import { ingestOnce } from './ingest'

const force = process.argv.includes('--force')
const { dbPath } = loadConfig()
mkdirSync(dirname(dbPath), { recursive: true })

const repository = new StationRepository(dbPath)
try {
  console.log('Downloading official fuel price feed (data.economie.gouv.fr)...')
  const result = await ingestOnce(repository, { force })
  console.log(`Ingested ${result.stored}/${result.received} stations into ${dbPath}`)
  if (Object.keys(result.skipped).length > 0) console.log('Skipped records:', result.skipped)
} finally {
  repository.close()
}
