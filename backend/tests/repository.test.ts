import { describe, expect, it } from 'vitest'
import { StationRepository } from '../src/db/stationRepository'
import type { Station } from '../src/domain'

const station = (id: number): Station => ({
  id,
  latitude: 48.85,
  longitude: 2.35,
  address: 'a',
  city: 'Paris',
  postalCode: '75001',
  departmentCode: '75',
  open24h: true,
  services: ['Boutique alimentaire'],
  hours: [],
  prices: [{ fuel: 'e10', price: 1.8, updatedAt: '2026-10-17T00:00:00Z' }],
  shortages: [],
})

describe('StationRepository', () => {
  it('replaces previous data atomically on each ingestion', () => {
    const repo = new StationRepository(':memory:')
    repo.replaceAll([station(1), station(2)], '2026-10-17T10:00:00Z')
    repo.replaceAll([station(3)], '2026-10-17T11:00:00Z')

    expect(repo.count()).toBe(1)
    expect(repo.findById(1)).toBeNull()
    expect(repo.findById(3)?.services).toEqual(['Boutique alimentaire'])
    expect(repo.lastIngestedAt()).toBe('2026-10-17T11:00:00Z')
    repo.close()
  })

  it('rolls back and keeps old data when an ingestion fails', () => {
    const repo = new StationRepository(':memory:')
    repo.replaceAll([station(1)], '2026-10-17T10:00:00Z')

    expect(() => repo.replaceAll([station(5), station(5)], '2026-10-17T11:00:00Z')).toThrow()
    expect(repo.count()).toBe(1)
    expect(repo.lastIngestedAt()).toBe('2026-10-17T10:00:00Z')
    repo.close()
  })
})
