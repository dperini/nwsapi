import path from 'node:path'
import { sourceStem } from './prefix-groups.mts'

const CATEGORY_ROOTS = new Set(['src/core', 'src/extension'])

export interface SourceLayoutIssue {
  kind:
    | 'uncategorized-module'
    | 'module-directory-pair'
    | 'authored-declaration'
  file: string
  directory: string
}

export function findSourceLayoutIssues(
  paths: readonly string[],
): SourceLayoutIssue[] {
  const knownPaths = new Set(
    paths
      .map(file => file.replaceAll('\\', '/'))
      .filter(file => file.startsWith('src/')),
  )
  const normalized = [...knownPaths]
  const directories = new Set<string>()
  for (const file of normalized) {
    let directory = path.posix.dirname(file)
    while (directory !== '.') {
      directories.add(directory)
      directory = path.posix.dirname(directory)
    }
  }

  return normalized.toSorted().flatMap(file => {
    const stem = sourceStem(file)
    if (!file.startsWith('src/') || stem === undefined) {
      return []
    }
    const issues: SourceLayoutIssue[] = []
    const parent = path.posix.dirname(file)
    if (CATEGORY_ROOTS.has(parent)) {
      issues.push({ kind: 'uncategorized-module', file, directory: parent })
    }
    if (/\.d\.[cm]?ts$/.test(file) && !file.startsWith('src/external/')) {
      issues.push({ kind: 'authored-declaration', file, directory: parent })
    }
    const sibling = path.posix.join(parent, stem)
    if (directories.has(sibling) || knownPaths.has(sibling)) {
      issues.push({ kind: 'module-directory-pair', file, directory: sibling })
    }
    return issues
  })
}
