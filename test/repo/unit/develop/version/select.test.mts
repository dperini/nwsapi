import { expect, test } from 'vitest'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { parseOptions } from '../../../../../scripts/repo/develop/protocol.mts'
import {
  createVersionCheckout,
  resolveVersion,
} from '../../../../../scripts/repo/develop/version/select.mts'
import { normalizePath } from '../../../../../scripts/repo/lib/paths.mts'

function git(root: string, ...args: string[]) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim()
}

test('resolves product labels to stable product branches', () => {
  expect(resolveVersion('v2')).toEqual({ version: 'v2', branch: 'master' })
  expect(resolveVersion('v3')).toEqual({
    version: 'v3',
    branch: 'prerelease/3.0.0',
  })
})

test('rejects invalid version options before any repository mutation', () => {
  expect(() => parseOptions(['--version', 'v4'])).toThrow(
    '--version v2 or --version v3',
  )
  expect(() => parseOptions(['--apply'])).toThrow('--apply requires --sweep')
})

test('creates a uniquely branched checkout beneath the system temporary directory', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'nwsapi-version-fixture-'))
  const temporaryRoot = realpathSync.native(os.tmpdir())
  try {
    git(root, 'init', '-b', 'master')
    git(root, 'config', 'user.email', 'fixture@example.test')
    git(root, 'config', 'user.name', 'Fixture')
    writeFileSync(path.join(root, 'file'), 'fixture')
    git(root, 'add', 'file')
    git(root, 'commit', '-m', 'fixture')
    git(root, 'branch', 'prerelease/3.0.0')
    const selected = createVersionCheckout(
      root,
      'v3',
      execFileSync,
      temporaryRoot,
    )
    const worktreeRoot = realpathSync.native(path.dirname(selected.path))
    expect(path.dirname(worktreeRoot)).toBe(temporaryRoot)
    expect(path.basename(worktreeRoot)).toMatch(/^nwsapi-worktree-/)
    expect(git(selected.path, 'branch', '--show-current')).toBe(
      selected.branchName,
    )
    const worktreePaths = git(root, 'worktree', 'list', '--porcelain')
      .split('\n')
      .filter(line => line.startsWith('worktree '))
      .map(line => normalizePath(line.slice('worktree '.length)))
    expect(worktreePaths).toContain(normalizePath(selected.path))
    git(root, 'worktree', 'remove', selected.path)
    git(root, 'branch', '-D', selected.branchName)
    rmSync(path.dirname(selected.path), { recursive: true, force: true })
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
