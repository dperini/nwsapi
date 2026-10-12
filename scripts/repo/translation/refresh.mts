import { createHash } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { REPO_ROOT } from '../lib/paths.mts'
import { markdownRecipe, renderRecipe, requests } from './markdown.mts'

interface Translation {
  sha256: string
  text: string
}

const files = process.argv.slice(2)
if (!files.length) {
  throw new Error('Usage: refresh.mts <changed-or-removed-document.md> [...]')
}
const output = path.join(
  REPO_ROOT,
  'assets/repo/model-guide/locales/documents.it.generated.json',
)
const documents = JSON.parse(readFileSync(output, 'utf8')) as Record<
  string,
  Translation
>
const dictionary = Object.assign(
  {},
  ...[
    '.cache/docs-localization/translations.json',
    'assets/repo/model-guide/locales/overrides.it.json',
  ].map(file => {
    const absolute = path.join(REPO_ROOT, file)
    return existsSync(absolute)
      ? JSON.parse(readFileSync(absolute, 'utf8'))
      : {}
  }),
) as Record<string, string>

for (const file of files) {
  const absolute = path.resolve(REPO_ROOT, file)
  const relative = path.relative(REPO_ROOT, absolute).split(path.sep).join('/')
  if (!relative.startsWith('docs/') || !relative.endsWith('.md')) {
    throw new Error(`Expected a Markdown document under docs/: ${file}`)
  }
  delete documents[relative]
  if (!existsSync(absolute)) {
    console.log(`Removed translation for ${relative}`)
    continue
  }
  const source = readFileSync(absolute, 'utf8').replaceAll('\r\n', '\n')
  requests.clear()
  const recipe = markdownRecipe(source)
  if ([...requests].some(text => !Object.hasOwn(dictionary, text))) {
    throw new Error(
      `Incomplete Italian translation for ${relative}. Run pnpm run docs:translate:it. No catalog changes were written.`,
    )
  }
  documents[relative] = {
    sha256: createHash('sha256').update(source).digest('hex'),
    text: renderRecipe(recipe, dictionary),
  }
  console.log(`Refreshed translation for ${relative}`)
}
writeFileSync(output, JSON.stringify(documents, null, 2) + '\n')
