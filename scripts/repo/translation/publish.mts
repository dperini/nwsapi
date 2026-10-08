import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import { renderRecipe } from './markdown.mts'
import type { Recipe } from './markdown.mts'
import { REPO_ROOT } from '../lib/paths.mts'

const cache = path.join(REPO_ROOT, '.cache/docs-localization')
const output = path.join(REPO_ROOT, 'assets/repo/model-guide/locales')
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
function write(name: string, data: unknown) {
  writeFileSync(path.join(output, name), JSON.stringify(data, null, 2) + '\n')
}
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
console.log(
  `Published JSON translations for ${documents.length} documents and ${ui.length} interface strings.`,
)
