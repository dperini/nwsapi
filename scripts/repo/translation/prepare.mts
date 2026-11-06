import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { object } from '@optique/core/constructs'
import { message } from '@optique/core/message'
import { optional } from '@optique/core/modifiers'
import { argument } from '@optique/core/primitives'
import { string } from '@optique/core/valueparser'
import { HELP_SHOWN, runCli } from '../lib/cli/parser.mts'
import { REPO_ROOT } from '../lib/paths.mts'
import { collectTranslationInput } from './inventory.mts'

const options = runCli(
  object({ documentPath: optional(argument(string())) }),
  'docs:translate:prepare',
  process.argv.slice(2),
  { brief: message`Prepare translation data for all or one known document.` },
)
if (options === HELP_SHOWN) {
  process.exit(0)
}
const { documentPath } = options
const directory = path.join(REPO_ROOT, '.cache/docs-localization')
mkdirSync(directory, { recursive: true })
const input = collectTranslationInput()
let documents = input.documents
let requests = input.requests
if (documentPath) {
  documents = documents.filter(document => document.source === documentPath)
  if (documents.length !== 1) {
    throw new Error(`Unknown translation document: ${documentPath}`)
  }
  const pending = new Set<string>()
  function collect(recipe: (typeof documents)[number]['recipe']) {
    if (typeof recipe === 'string') {
      return
    }
    if (input.requests.includes(recipe.text)) {
      pending.add(recipe.text)
    }
    recipe.slots.forEach(collect)
  }
  collect(documents[0]!.recipe)
  requests = [...pending]
}
const output = {
  ...input,
  documents,
  requests,
  ...(documentPath ? { ui: [] } : {}),
}
for (const [name, value] of Object.entries(output)) {
  writeFileSync(path.join(directory, `${name}.json`), JSON.stringify(value))
}
console.log(
  `${documents.length} documents, ${output.ui.length} interface strings, ${requests.length} translation requests`,
)
