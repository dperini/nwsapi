import { realpathSync, statSync } from 'node:fs'
import path from 'node:path'

import { normalizePath, REPO_ROOT } from '../lib/paths.mts'
import { toolingFiles } from '../lib/tooling-scope.mts'

export interface LintArguments {
  files?: string[] | undefined
  forwarded: string[]
}

export function parseLintArguments(args: readonly string[]): LintArguments {
  const files: string[] = []
  const forwarded: string[] = []
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index]!
    if (argument === '--file') {
      const file = args[index + 1]
      if (file === undefined) {
        throw new Error('--file requires a path.')
      }
      assertPathArgument(file)
      files.push(file)
      index += 1
      continue
    }
    if (argument.startsWith('--file=')) {
      const file = argument.slice('--file='.length)
      assertPathArgument(file)
      files.push(file)
      continue
    }
    forwarded.push(argument)
  }
  return { files: files.length > 0 ? files : undefined, forwarded }
}

function assertPathArgument(file: string) {
  if (!file || file.includes('\0')) {
    throw new Error('--file requires a nonempty path without NUL characters.')
  }
}

function isWithin(root: string, target: string): boolean {
  const relative = path.relative(root, target)
  return (
    relative === '' ||
    (!path.isAbsolute(relative) &&
      relative !== '..' &&
      !relative.startsWith(`..${path.sep}`))
  )
}

export function selectedLintFiles(
  requested: readonly string[] | undefined,
  root = REPO_ROOT,
  availableFiles = toolingFiles(root),
): string[] {
  if (!requested) {
    return availableFiles
  }
  const repository = realpathSync(root)
  const allowed = new Set(availableFiles.map(normalizePath))
  const selected = new Set<string>()
  for (const file of requested) {
    assertPathArgument(file)
    const absolute = path.resolve(repository, file)
    if (!isWithin(repository, absolute)) {
      throw new Error(`Lint file is outside the repository: ${file}`)
    }
    let realPath: string
    try {
      realPath = realpathSync(absolute)
    } catch {
      throw new Error(`Lint file does not exist: ${file}`)
    }
    if (!isWithin(repository, realPath)) {
      throw new Error(`Lint file resolves outside the repository: ${file}`)
    }
    if (!statSync(realPath).isFile()) {
      throw new Error(`Lint path is not a file: ${file}`)
    }
    const relative = normalizePath(path.relative(repository, realPath))
    if (!allowed.has(relative)) {
      throw new Error(`Lint file is outside the configured scope: ${file}`)
    }
    selected.add(relative)
  }
  return [...selected]
}
