import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { REPO_ROOT } from '../lib/paths.mts'
import { collectTranslationInput } from './inventory.mts'

const directory = path.join(REPO_ROOT, '.cache/docs-localization')
mkdirSync(directory, { recursive: true })
const input = collectTranslationInput()
for (const [name, value] of Object.entries(input)) {
  writeFileSync(path.join(directory, `${name}.json`), JSON.stringify(value))
}
console.log(
  `${input.documents.length} documents, ${input.ui.length} interface strings, ${input.requests.length} translation requests`,
)
