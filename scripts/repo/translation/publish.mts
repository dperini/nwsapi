import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import { object } from '@optique/core/constructs'
import { message } from '@optique/core/message'
import { optional } from '@optique/core/modifiers'
import { argument } from '@optique/core/primitives'
import { string } from '@optique/core/valueparser'
import { HELP_SHOWN, runCli } from '../lib/cli/parser.mts'
import { renderRecipe } from './markdown.mts'
import type { Recipe } from './markdown.mts'
import { REPO_ROOT } from '../lib/paths.mts'

const cache = path.join(REPO_ROOT, '.cache/docs-localization')
const output = path.join(REPO_ROOT, 'assets/repo/model-guide/locales')
const options = runCli(
  object({ documentPath: optional(argument(string())) }),
  'docs:translate:publish',
  process.argv.slice(2),
  { brief: message`Publish translations for all or one known document.` },
)
if (options === HELP_SHOWN) {
  process.exit(0)
}
const { documentPath } = options
const translations = JSON.parse(
  readFileSync(path.join(cache, 'translations.json'), 'utf8'),
) as Record<string, string>
const ui = JSON.parse(
  readFileSync(path.join(cache, 'ui.json'), 'utf8'),
) as string[]
const documents = JSON.parse(
  readFileSync(path.join(cache, 'documents.json'), 'utf8'),
) as Array<{ source: string; sha256: string; recipe: Recipe }>
const overrides = JSON.parse(
  readFileSync(path.join(output, 'overrides.it.json'), 'utf8'),
) as Record<string, string>
const dictionary = { ...translations, ...overrides }
const requests = JSON.parse(
  readFileSync(path.join(cache, 'requests.json'), 'utf8'),
) as string[]
const missing = requests.filter(text => !Object.hasOwn(dictionary, text))
if (missing.length) {
  throw new Error(
    `${missing.length} translations are missing. Run docs:translate:it first.`,
  )
}
mkdirSync(output, { recursive: true })
export function write(name: string, data: unknown) {
  writeFileSync(path.join(output, name), JSON.stringify(data, null, 2) + '\n')
}
if (documentPath) {
  const document = documents.find(item => item.source === documentPath)
  if (!document) {
    throw new Error(`Unknown translation document: ${documentPath}`)
  }
  const filename = path.join(output, 'documents.it.generated.json')
  const existing = JSON.parse(readFileSync(filename, 'utf8')) as Record<
    string,
    unknown
  >
  existing[document.source] = {
    sha256: document.sha256,
    text: renderRecipe(document.recipe, dictionary),
  }
  write('documents.it.generated.json', existing)
  const strings = JSON.parse(
    readFileSync(path.join(output, 'strings.it.generated.json'), 'utf8'),
  ) as Record<string, string>
  write('strings.it.generated.json', { ...strings, ...overrides })
} else {
  write('strings.it.generated.json', {
    ...Object.fromEntries(ui.toSorted().map(key => [key, dictionary[key]])),
    ...overrides,
  })
  write(
    'documents.it.generated.json',
    Object.fromEntries(
      documents.map(document => [
        document.source,
        {
          sha256: document.sha256,
          text: renderRecipe(document.recipe, dictionary),
        },
      ]),
    ),
  )
}
console.log(
  documentPath
    ? `Published Italian translation for ${documentPath}.`
    : `Published JSON translations for ${documents.length} documents and ${ui.length} interface strings.`,
)
