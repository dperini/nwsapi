import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { collectTranslationInput } from './inventory.mts'
import { renderRecipe } from './markdown.mts'
import { runTranslations, sameSlots } from './engine.mts'
import { REPO_ROOT } from '../lib/paths.mts'

export const DOCUMENT_CATALOG =
  'assets/repo/model-guide/locales/documents.it.generated.json'
export const STRING_CATALOG =
  'assets/repo/model-guide/locales/strings.it.generated.json'

export function readDictionary(file: string): Record<string, string> {
  return existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : {}
}

export function isTranslationSource(file: string) {
  return (
    file === 'README.md' ||
    (file.startsWith('docs/') && /\.(md|html|mts)$/.test(file)) ||
    file === 'assets/repo/model-guide/narration/transcript.json' ||
    /^assets\/repo\/bench\/survey-2026-10-03\/neural-dispatch-(crossed|jit)-2026-10-05\.html$/.test(
      file,
    )
  )
}

export async function translateIncremental(
  files: string[],
  root = REPO_ROOT,
  translate: (root: string) => Promise<void> = runTranslations,
) {
  const sources = files.filter(isTranslationSource)
  if (!sources.length) {
    return []
  }
  const input = collectTranslationInput(root, sources)
  const cache = path.join(root, '.cache/docs-localization')
  mkdirSync(cache, { recursive: true })
  const overrides = readDictionary(
    path.join(root, 'assets/repo/model-guide/locales/overrides.it.json'),
  )
  const dictionary = {
    ...readDictionary(path.join(root, STRING_CATALOG)),
    ...readDictionary(path.join(cache, 'translations.json')),
    ...overrides,
  }
  writeFileSync(
    path.join(cache, 'translations.json'),
    JSON.stringify(dictionary),
  )
  writeFileSync(
    path.join(cache, 'requests.json'),
    JSON.stringify(input.requests),
  )
  if (
    input.requests.some(
      text => !dictionary[text] || !sameSlots(text, dictionary[text]!),
    )
  ) {
    await translate(root)
  }
  Object.assign(
    dictionary,
    readDictionary(path.join(cache, 'translations.json')),
    overrides,
  )
  for (const text of input.requests) {
    if (!dictionary[text] || !sameSlots(text, dictionary[text]!)) {
      throw new Error(`Missing or invalid translation: ${text}`)
    }
  }
  const documentFile = path.join(root, DOCUMENT_CATALOG)
  const documents = JSON.parse(readFileSync(documentFile, 'utf8')) as Record<
    string,
    { sha256: string; text: string }
  >
  for (const file of sources) {
    if (!existsSync(path.join(root, file))) {
      delete documents[file]
    }
  }
  for (const document of input.documents) {
    documents[document.source] = {
      sha256: document.sha256,
      text: renderRecipe(document.recipe, dictionary),
    }
  }
  writeFileSync(documentFile, JSON.stringify(documents, null, 2) + '\n')
  const strings = readDictionary(path.join(root, STRING_CATALOG))
  for (const text of input.ui) {
    strings[text] = dictionary[text]!
  }
  Object.assign(strings, overrides)
  writeFileSync(
    path.join(root, STRING_CATALOG),
    JSON.stringify(strings, null, 2) + '\n',
  )
  return [DOCUMENT_CATALOG, STRING_CATALOG]
}
