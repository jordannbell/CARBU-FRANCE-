import { describe, expect, it } from 'vitest'
import fixture from './fixtures/records-paris.json'
import { parseStationRecord, parseStationRecords } from '../src/ingest/parseRecord'

const records = fixture.results as unknown[]

describe('parseStationRecord', () => {
  it('parses a real record into a station with prices', () => {
    const result = parseStationRecord(records[0])

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.id).toBeTypeOf('number')
    expect(result.value.latitude).toBeGreaterThan(48)
    expect(result.value.prices.length).toBeGreaterThan(0)
    expect(result.value.prices.every((p) => p.price > 0)).toBe(true)
  })

  it('rejects a record without geometry', () => {
    const result = parseStationRecord({ id: 1, geom: null })
    expect(result).toEqual({ ok: false, reason: 'missing-geometry' })
  })

  it('rejects a record that does not match the schema', () => {
    expect(parseStationRecord({ id: 'abc' })).toEqual({ ok: false, reason: 'schema' })
    expect(parseStationRecord(null)).toEqual({ ok: false, reason: 'schema' })
  })

  it('ignores zero or missing prices', () => {
    const result = parseStationRecord({
      id: 2,
      geom: { lat: 48.8, lon: 2.3 },
      gazole_prix: 0,
      gazole_maj: '2026-10-16T05:11:49+00:00',
      e10_prix: null,
    })
    expect(result.ok && result.value.prices).toEqual([])
  })

  it('maps temporary and definitive shortages', () => {
    const result = parseStationRecord({
      id: 3,
      geom: { lat: 48.8, lon: 2.3 },
      gazole_rupture_type: 'temporaire',
      gazole_rupture_debut: '2026-10-10T08:00:00+00:00',
      sp95_rupture_type: 'definitive',
      sp95_rupture_debut: '2020-07-15T09:39:24+00:00',
    })
    expect(result.ok && result.value.shortages.map((s) => [s.fuel, s.type])).toEqual([
      ['gazole', 'temporaire'],
      ['sp95', 'definitive'],
    ])
  })
})

describe('parseStationRecords', () => {
  it('counts skipped records by reason', () => {
    const batch = parseStationRecords([...records, { id: 9, geom: null }, 'garbage'])
    expect(batch.stations.length).toBe(records.length)
    expect(batch.skipped).toEqual({ 'missing-geometry': 1, schema: 1 })
  })
})
