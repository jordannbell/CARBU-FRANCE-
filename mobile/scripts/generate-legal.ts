// Writes PRIVACY.md and LEGAL.md at the repository root from src/legal/content.json, so the
// documents and the in-app screens always say the same thing. Run: npm run legal:generate
import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { LEGAL_UPDATED_AT, getDocument, toMarkdown } from '../src/legal/render'

const root = resolve(import.meta.dirname, '..', '..')
writeFileSync(resolve(root, 'PRIVACY.md'), toMarkdown(getDocument('privacy'), LEGAL_UPDATED_AT))
writeFileSync(resolve(root, 'LEGAL.md'), toMarkdown(getDocument('legalNotice'), LEGAL_UPDATED_AT))
console.log('PRIVACY.md and LEGAL.md generated')
