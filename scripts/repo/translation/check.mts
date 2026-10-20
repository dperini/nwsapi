import { readFileSync } from 'node:fs'
import path from 'node:path'
import { REPO_ROOT } from '../lib/paths.mts'
import { isMainModule } from '../lib/run-node.mts'
import { collectTranslationInput } from './inventory.mts'

interface DocumentTranslation {
  sha256: string
  text: string
}

export function readJson(root: string, file: string): unknown {
  return JSON.parse(readFileSync(path.join(root, file), 'utf8'))
}

export function slots(text: string) {
  return [...text.matchAll(/ZXQ\d+QXZ|\{[A-Za-z]\w*\}/g)]
    .map(match => match[0])
    .toSorted()
    .join(',')
}

export function checkMessages(
  source: Record<string, string>,
  translated: Record<string, string>,
  label: string,
  problems: string[],
) {
  for (const [key, value] of Object.entries(source)) {
    const result = translated[key]
    if (typeof result !== 'string' || !result.trim()) {
      problems.push(`${label}: missing translation for ${key}`)
    } else if (slots(value) !== slots(result)) {
      problems.push(`${label}: changed placeholders for ${key}`)
    }
  }
}

export function checkOverrides(
  root: string,
  directory: string,
  problems: string[],
) {
  const overrides = readJson(root, `${directory}/overrides.it.json`) as Record<
    string,
    string
  >
  const published = readJson(
    root,
    `${directory}/strings.it.generated.json`,
  ) as Record<string, string>
  checkMessages(
    Object.fromEntries(Object.keys(overrides).map(text => [text, text])),
    overrides,
    'Italian overrides',
    problems,
  )
  for (const [key, value] of Object.entries(overrides)) {
    if (published[key] !== value) {
      problems.push(`Unpublished Italian override: ${key}`)
    }
  }
}

export function checkTranslations(root = REPO_ROOT) {
  const input = collectTranslationInput(root)
  const directory = 'assets/repo/model-guide/locales'
  const documents = readJson(
    root,
    `${directory}/documents.it.generated.json`,
  ) as Record<string, DocumentTranslation>
  const problems: string[] = []
  const sources = new Set(input.documents.map(document => document.source))
  for (const document of input.documents) {
    const translated = documents[document.source]
    if (
      !translated ||
      typeof translated.text !== 'string' ||
      !translated.text.trim()
    ) {
      problems.push(`Missing Italian document: ${document.source}`)
    } else if (translated.sha256 !== document.sha256) {
      problems.push(`Stale Italian document: ${document.source}`)
    } else if (/ZXQ\d+QXZ/.test(translated.text)) {
      problems.push(`Unresolved translation placeholders: ${document.source}`)
    }
  }
  for (const source of Object.keys(documents)) {
    if (!sources.has(source)) {
      problems.push(`Removed source still in Italian catalog: ${source}`)
    }
  }
  checkMessages(
    Object.fromEntries(input.ui.map(text => [text, text])),
    readJson(root, `${directory}/strings.it.generated.json`) as Record<
      string,
      string
    >,
    'Italian interface',
    problems,
  )
  checkOverrides(root, directory, problems)
  const location = 'docs/repo/perf/pytorch-has-routing/locales'
  checkMessages(
    readJson(root, `${location}/en.json`) as Record<string, string>,
    readJson(root, `${location}/it.json`) as Record<string, string>,
    location,
    problems,
  )
  if (problems.length) {
    throw new Error(
      `Language coverage needs an update:\n${problems.join('\n')}\nRun pnpm run docs:translate:it, review the translations, and commit the catalogs with the source edits.`,
    )
  }
  console.log(
    `Language coverage: ${input.documents.length} documents and ${input.ui.length} interface strings are current.`,
  )
}

if (isMainModule(import.meta.url)) {
  checkTranslations()
}
