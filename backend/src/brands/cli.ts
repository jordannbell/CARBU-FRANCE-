import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { loadConfig } from '../config'
import { StationRepository } from '../db/stationRepository'
import { refreshBrands } from './refresh'

const { dbPath } = loadConfig()
mkdirSync(dirname(dbPath), { recursive: true })

const repository = new StationRepository(dbPath)
try {
  console.log('Downloading station brands from OpenStreetMap (can take a few minutes)...')
  const result = await refreshBrands(repository)
  console.log(
    result.replaced
      ? `Stored brands for ${result.stored} stations.`
      : `Answer too small, kept the ${result.stored} brands already stored.`,
  )
} catch (error) {
  console.error(`Brand download failed: ${error instanceof Error ? error.message : String(error)}`)
  process.exitCode = 1
} finally {
  repository.close()
}
