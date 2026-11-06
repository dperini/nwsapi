import { lstatSync, realpathSync, statSync } from 'node:fs'
import path from 'node:path'

export function documentAliases(sources: string[]) {
  const candidates = new Map<string, string[]>()
  for (const source of sources) {
    if (!isTranslatableDocument(source)) {
      continue
    }
    const alias =
      source === 'README.md' ? 'readme' : path.posix.basename(source, '.md')
    const matches = candidates.get(alias) ?? []
    matches.push(source)
    candidates.set(alias, matches)
  }
  const aliases = new Map<string, string>()
  for (const [alias, matches] of candidates) {
    if (matches.length === 1) {
      aliases.set(alias, matches[0]!)
      continue
    }
    for (const source of matches) {
      aliases.set(source.slice('docs/'.length, -'.md'.length), source)
    }
  }
  return aliases
}

export function resolveTranslationDocument(
  root: string,
  alias: string,
  sources: string[],
) {
  const source = documentAliases(sources).get(alias)
  if (!source) {
    throw new Error(`Unknown document name: ${alias}`)
  }
  if (!isTranslatableDocument(source)) {
    throw new Error(
      'Only repository documentation Markdown files can be translated.',
    )
  }

  const rootPath = realpathSync(root)
  const requestedPath = path.resolve(rootPath, source)
  assertPathWithin(rootPath, requestedPath)
  const metadata = lstatSync(requestedPath)
  if (!metadata.isFile() && !metadata.isSymbolicLink()) {
    throw new Error('Translation target must be a Markdown file.')
  }
  if (!statSync(requestedPath).isFile()) {
    throw new Error('Translation target must be a regular Markdown file.')
  }
  assertPathWithin(rootPath, realpathSync(requestedPath))
  return source
}

export function isTranslatableDocument(source: string) {
  return (
    (source === 'README.md' || source.startsWith('docs/')) &&
    source.endsWith('.md') &&
    !source.endsWith('.it.md') &&
    !source.includes('/translations/')
  )
}

export function assertPathWithin(root: string, candidate: string) {
  const relative = path.relative(root, candidate)
  if (
    relative === '..' ||
    relative.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relative)
  ) {
    throw new Error('Translation target must resolve inside the repository.')
  }
}
