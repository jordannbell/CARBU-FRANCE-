import content from './content.json'

export interface LegalSection {
  readonly title: string
  readonly body?: readonly string[]
  readonly list?: readonly string[]
}

export interface LegalDocument {
  readonly title: string
  readonly intro: string
  readonly sections: readonly LegalSection[]
}

export type LegalKind = 'privacy' | 'legalNotice'

type Values = Readonly<Record<string, string>>

const TOKEN = /\{\{(\w+)\}\}/g
/** What the editor must replace before publication. */
export const PLACEHOLDER_MARKER = '[À COMPLÉTER'

export const legalValues: Values = { ...content.identity, updatedAt: content.updatedAt }

/** Replaces {{tokens}}. An unknown token is left visible so it is caught, never silently dropped. */
export function fillTemplate(text: string, values: Values = legalValues): string {
  return text.replace(TOKEN, (match, key: string) => values[key] ?? match)
}

export function getDocument(kind: LegalKind, values: Values = legalValues): LegalDocument {
  const doc = content[kind]
  return {
    title: doc.title,
    intro: fillTemplate(doc.intro, values),
    sections: doc.sections.map((section) => ({
      title: section.title,
      ...('body' in section && section.body
        ? { body: section.body.map((line) => fillTemplate(line, values)) }
        : {}),
      ...('list' in section && section.list
        ? { list: section.list.map((line) => fillTemplate(line, values)) }
        : {}),
    })),
  }
}

export function toMarkdown(doc: LegalDocument, updatedAt: string): string {
  const lines: string[] = [
    `# ${doc.title} — ${content.identity.appName}`,
    '',
    `*Dernière mise à jour : ${updatedAt}*`,
    '',
    doc.intro,
    '',
  ]
  for (const section of doc.sections) {
    lines.push(`## ${section.title}`, '')
    for (const paragraph of section.body ?? []) lines.push(paragraph, '')
    for (const item of section.list ?? []) lines.push(`- ${item}`)
    if (section.list) lines.push('')
  }
  return `${lines.join('\n').trimEnd()}\n`
}

/** Text that still needs the editor's real details, or that contains an unfilled token. */
export function findUnfilled(doc: LegalDocument): readonly string[] {
  const all = [doc.intro, ...doc.sections.flatMap((s) => [...(s.body ?? []), ...(s.list ?? [])])]
  return all.filter((line) => line.includes(PLACEHOLDER_MARKER) || /\{\{\w+\}\}/.test(line))
}

export const LEGAL_UPDATED_AT = content.updatedAt
