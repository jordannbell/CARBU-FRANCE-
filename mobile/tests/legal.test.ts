import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import content from '../src/legal/content.json'
import {
  LEGAL_UPDATED_AT,
  fillTemplate,
  findUnfilled,
  getDocument,
  legalValues,
  toMarkdown,
  type LegalKind,
} from '../src/legal/render'

const root = resolve(__dirname, '..', '..')
const read = (...parts: string[]) => readFileSync(resolve(root, ...parts), 'utf-8')
const kinds: readonly LegalKind[] = ['privacy', 'legalNotice']

const allText = (kind: LegalKind) => {
  const doc = content[kind]
  return [
    doc.intro,
    ...doc.sections.flatMap((s) => [
      s.title,
      ...('body' in s && s.body ? s.body : []),
      ...('list' in s && s.list ? s.list : []),
    ]),
  ].join('\n')
}

describe('legal texts', () => {
  it('every {{token}} used in the texts has a value', () => {
    for (const kind of kinds) {
      for (const [, key] of allText(kind).matchAll(/\{\{(\w+)\}\}/g)) {
        expect(legalValues, `missing value for {{${key}}}`).toHaveProperty(key ?? '')
      }
    }
  })

  it('flags the editor details that still have to be filled in before publication', () => {
    // This is the release gate behind `npm run legal:check`: it must fail until the identity is real.
    expect(findUnfilled(getDocument('privacy')).length).toBeGreaterThan(0)
    expect(findUnfilled(getDocument('legalNotice')).length).toBeGreaterThan(0)
  })

  it('passes the release gate once every identity field is filled', () => {
    const filled = Object.fromEntries(Object.keys(legalValues).map((key) => [key, `valeur ${key}`]))
    for (const kind of kinds) {
      expect(findUnfilled(getDocument(kind, filled))).toEqual([])
    }
  })

  it('leaves an unknown token visible instead of silently dropping it', () => {
    expect(fillTemplate('Bonjour {{inconnu}}')).toBe('Bonjour {{inconnu}}')
  })

  it('keeps PRIVACY.md and LEGAL.md in sync with the in-app texts', () => {
    // Fails after editing content.json without running `npm run legal:generate`.
    expect(read('PRIVACY.md')).toBe(toMarkdown(getDocument('privacy'), LEGAL_UPDATED_AT))
    expect(read('LEGAL.md')).toBe(toMarkdown(getDocument('legalNotice'), LEGAL_UPDATED_AT))
  })
})

describe('the privacy policy matches what the code really does', () => {
  const privacy = allText('privacy')

  it('states the retention periods that the backend enforces', () => {
    const deviceDays = /DEVICE_RETENTION_DAYS = (\d+)/.exec(
      read('backend', 'src', 'server.ts'),
    )?.[1]
    const historyDays = /HISTORY_RETENTION_DAYS = (\d+)/.exec(
      read('backend', 'src', 'db', 'stationRepository.ts'),
    )?.[1]
    expect(deviceDays).toBeDefined()
    expect(historyDays).toBeDefined()
    expect(privacy).toContain(`${deviceDays} jours`)
    expect(privacy).toContain(`${historyDays} jours`)
  })

  it('names every third party the backend or the app talks to', () => {
    const externalHosts = {
      'data.geopf.fr': 'Géoplateforme',
      'heigit.org': 'OpenRouteService',
      'exp.host': 'Expo',
      'router.project-osrm.org': 'OSRM',
    }
    const backend = ['geocoding/ign.ts', 'routing/ors.ts', 'routing/osrm.ts', 'alerts/push.ts']
      .map((file) => read('backend', 'src', file))
      .join('\n')
    for (const [host, name] of Object.entries(externalHosts)) {
      expect(backend, `${host} should still be used`).toContain(host)
      expect(privacy, `${name} must be disclosed`).toContain(name)
    }
  })

  it('does not claim ads or trackers while none are installed', () => {
    const dependencies = Object.keys(
      (JSON.parse(read('mobile', 'package.json')) as { dependencies: Record<string, string> })
        .dependencies,
    )
    const adOrTracking = dependencies.filter((name) =>
      /admob|google-mobile-ads|firebase|analytics|sentry|amplitude|mixpanel|segment|facebook|appsflyer|adjust/i.test(
        name,
      ),
    )
    // If this fails, the policy ("no advertising, no tracker") and the consent flow must be revised first.
    expect(adOrTracking).toEqual([])
    expect(privacy).toContain('aucune publicité')
  })

  it('tells users how to delete their data', () => {
    expect(privacy).toContain('Supprimer mes données')
    expect(privacy).toContain('CNIL')
  })
})
