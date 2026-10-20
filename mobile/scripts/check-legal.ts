// Release gate: fails while the legal texts still contain placeholders to fill in.
// Run before publishing to a store: npm run legal:check
import { findUnfilled, getDocument } from '../src/legal/render'

const problems = [
  ...findUnfilled(getDocument('privacy')),
  ...findUnfilled(getDocument('legalNotice')),
]
if (problems.length > 0) {
  console.error(
    `Legal texts are incomplete (${problems.length} lines). Fill src/legal/content.json:`,
  )
  for (const line of new Set(problems)) console.error(`  - ${line}`)
  process.exit(1)
}
console.log('Legal texts are complete.')
