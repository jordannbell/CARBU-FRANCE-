import { describe, expect, it } from 'vitest'
import { parseOpeningHours } from '../src/ingest/hours'
import { parseStationRecord } from '../src/ingest/parseRecord'
import fixture from './fixtures/records-paris.json'

const feedHours = (days: unknown[]) => JSON.stringify({ '@automate-24-24': '', jour: days })

describe('parseOpeningHours', () => {
  it('normalises "07.30" to "07:30" and flags closed days', () => {
    const hours = parseOpeningHours(
      feedHours([
        { '@id': '1', '@ferme': '', horaire: { '@ouverture': '07.30', '@fermeture': '21.00' } },
        { '@id': '7', '@ferme': '1' },
      ]),
    )
    expect(hours).toEqual([
      { day: 1, closed: false, ranges: [{ open: '07:30', close: '21:00' }] },
      { day: 7, closed: true, ranges: [] },
    ])
  })

  it('supports several ranges in one day', () => {
    const hours = parseOpeningHours(
      feedHours([
        {
          '@id': '2',
          horaire: [
            { '@ouverture': '08.00', '@fermeture': '12.00' },
            { '@ouverture': '14.00', '@fermeture': '19.00' },
          ],
        },
      ]),
    )
    expect(hours[0]?.ranges).toHaveLength(2)
  })

  it('sorts days Monday to Sunday and drops invalid days', () => {
    const hours = parseOpeningHours(
      feedHours([
        { '@id': '3', '@ferme': '1' },
        { '@id': '1', '@ferme': '1' },
        { '@id': '9', '@ferme': '1' },
        { '@id': 'x', '@ferme': '1' },
      ]),
    )
    expect(hours.map((d) => d.day)).toEqual([1, 3])
  })

  it('treats an unreadable range as a closed day instead of inventing hours', () => {
    const hours = parseOpeningHours(
      feedHours([{ '@id': '1', horaire: { '@ouverture': 'matin', '@fermeture': '??' } }]),
    )
    expect(hours).toEqual([{ day: 1, closed: true, ranges: [] }])
  })

  it.each([[null], [undefined], [''], ['not json'], ['{"jour": 3}'], ['[]']])(
    'returns no hours for %j',
    (raw) => {
      expect(parseOpeningHours(raw)).toEqual([])
    },
  )

  it('is wired into real feed records', () => {
    const results = (fixture.results as unknown[]).map(parseStationRecord)
    const withHours = results.filter((r) => r.ok && r.value.hours.length > 0)
    expect(withHours.length).toBeGreaterThan(0)
  })
})
