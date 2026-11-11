import { execFileSync } from 'node:child_process'
import { existsSync, lstatSync } from 'node:fs'
import path from 'node:path'

export function gitEnvironment() {
  const env = { ...process.env }
  for (const name of [
    'GIT_DIR',
    'GIT_COMMON_DIR',
    'GIT_WORK_TREE',
    'GIT_INDEX_FILE',
    'GIT_OBJECT_DIRECTORY',
    'GIT_ALTERNATE_OBJECT_DIRECTORIES',
    'GIT_PREFIX',
  ]) {
    delete env[name]
  }
  return { ...env, QUALITY_FOLLOWUP_WORKER: '1' }
}

export function git(root: string, args: string[], input?: string) {
  return execFileSync('git', args, {
    cwd: root,
    env: gitEnvironment(),
    input,
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
    stdio: ['pipe', 'pipe', 'pipe'],
  })
}

export function gitPath(root: string, name: string) {
  return path.resolve(root, git(root, ['rev-parse', '--git-path', name]).trim())
}

export function branch(root: string) {
  return git(root, ['symbolic-ref', '--quiet', 'HEAD']).trim()
}

export function changedFiles(root: string, commit: string) {
  const parent = git(root, ['show', '-s', '--format=%P', commit])
    .trim()
    .split(' ')[0]
  return git(root, [
    'diff-tree',
    '--root',
    '--no-commit-id',
    '--name-only',
    '--no-renames',
    '-r',
    '-z',
    ...(parent ? [parent, commit] : [commit]),
    '--',
  ])
    .split('\0')
    .filter(Boolean)
}

export function regularFiles(root: string, files: string[]) {
  return files.filter(file => {
    const absolute = path.resolve(root, file)
    if (!absolute.startsWith(`${path.resolve(root)}${path.sep}`)) {
      throw new Error(`Path outside checkout: ${file}`)
    }
    return lstatSync(absolute, { throwIfNoEntry: false })?.isFile()
  })
}

export function operationInProgress(root: string) {
  return [
    'rebase-merge',
    'rebase-apply',
    'MERGE_HEAD',
    'CHERRY_PICK_HEAD',
    'REVERT_HEAD',
    'sequencer',
  ].some(name => existsSync(gitPath(root, name)))
}

export function canApply(root: string, source: string, ref: string) {
  try {
    return (
      !operationInProgress(root) &&
      branch(root) === ref &&
      git(root, ['rev-parse', 'HEAD']).trim() === source &&
      git(root, [
        'status',
        '--porcelain=v1',
        '--untracked-files=all',
      ]).trim() === ''
    )
  } catch {
    return false
  }
}

export function assertAllowedChanges(root: string, allowed: string[]) {
  const paths = git(root, [
    'status',
    '--porcelain=v1',
    '-z',
    '--untracked-files=all',
  ])
    .split('\0')
    .filter(Boolean)
  const selected = new Set(allowed)
  for (const entry of paths) {
    if (!selected.has(entry.slice(3)) || /^[RC]|^.[RC]/.test(entry)) {
      throw new Error(`Tool changed a path outside the commit scope: ${entry}`)
    }
  }
}
