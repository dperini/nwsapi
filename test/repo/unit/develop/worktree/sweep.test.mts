import { expect, test } from 'vitest'
import { execFileSync } from 'node:child_process'
import {
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import os, { hostname } from 'node:os'
import path from 'node:path'
import { foldPathForCompare } from '../../../../../scripts/repo/lib/paths.mts'
import { claimWorktree } from '../../../../../scripts/repo/develop/worktree/lease.mts'
import {
  candidatePathsMatch,
  parseWorktreeInventory,
  sweepWorktrees,
} from '../../../../../scripts/repo/develop/worktree/sweep.mts'
import { createVersionCheckout } from '../../../../../scripts/repo/develop/version/select.mts'

function git(root: string, ...args: string[]) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim()
}

function cleanupGit(root: string, ...args: string[]) {
  try {
    execFileSync('git', args, { cwd: root, stdio: 'ignore' })
  } catch {
    // Fixture cleanup tolerates an already-removed worktree or branch.
  }
}

test('parses Git worktree records with Windows line endings, spaces, and locked or detached checkouts', () => {
  expect(
    parseWorktreeInventory(
      'worktree C:/Users/Dev Name/repo\r\nHEAD abc\r\nbranch refs/heads/master\r\n\r\nworktree C:/Temp/checkout\r\nHEAD def\r\ndetached\r\nlocked maintenance\r\n\r\n',
    ),
  ).toEqual([
    { path: 'C:/Users/Dev Name/repo', branch: 'master', locked: false },
    { path: 'C:/Temp/checkout', branch: undefined, locked: true },
  ])
  expect(parseWorktreeInventory('')).toEqual([])
})

test('matches native Windows paths to Git paths while rejecting unrelated cleanup targets', () => {
  const metadata = { repository: 'C:/repo/.git' }
  const paths = {
    parent: 'C:\\Temp\\nwsapi-worktree-owned',
    temporaryRoot: 'C:/Temp',
    repository: 'C:\\repo\\.git',
    checkout: 'C:\\Temp\\nwsapi-worktree-owned\\checkout',
  }
  expect(candidatePathsMatch(metadata, paths)).toBe(true)
  expect(candidatePathsMatch({ repository: 'C:/other/.git' }, paths)).toBe(
    false,
  )
  expect(candidatePathsMatch(metadata, { ...paths, parent: 'C:/Temp' })).toBe(
    false,
  )
  expect(
    candidatePathsMatch(metadata, { ...paths, temporaryRoot: 'C:/Tem' }),
  ).toBe(false)
  expect(
    candidatePathsMatch(metadata, {
      ...paths,
      checkout: 'C:/Temp/unrelated/checkout',
    }),
  ).toBe(false)
})

function repositoryIdentity(root: string) {
  return path.resolve(root, git(root, 'rev-parse', '--git-common-dir'))
}

function makeRepository() {
  const temporaryRoot = mkdtempSync(
    path.join(os.tmpdir(), 'nwsapi-sweep-fixture-'),
  )
  const root = path.join(temporaryRoot, 'repository')
  mkdirSync(root)
  git(root, 'init', '-b', 'prerelease/3.0.0')
  git(root, 'config', 'user.email', 'fixture@example.test')
  git(root, 'config', 'user.name', 'Fixture')
  writeFileSync(path.join(root, 'tracked'), 'base')
  git(root, 'add', 'tracked')
  git(root, 'commit', '-m', 'base')
  return { temporaryRoot, root: realpathSync(root) }
}

async function makeManaged(root: string, temporaryRoot: string) {
  const selected = createVersionCheckout(
    root,
    'v3',
    execFileSync,
    temporaryRoot,
  )
  const metadata = {
    schemaVersion: 1 as const,
    repository: repositoryIdentity(root),
    path: selected.path,
    version: 'v3' as const,
    sourceBranch: selected.branchName,
    sourceHead: git(selected.path, 'rev-parse', 'HEAD'),
    targetBranch: 'prerelease/3.0.0',
    owner: 'fixture',
  }
  const lease = await claimWorktree(metadata)
  return { ...selected, metadata, lease }
}

test('removes only a clean, released, nonempty source whose HEAD is merged into its exact target', async () => {
  const { temporaryRoot, root } = makeRepository()
  let managed: Awaited<ReturnType<typeof makeManaged>> | undefined
  try {
    managed = await makeManaged(root, temporaryRoot)
    writeFileSync(path.join(managed.path, 'change'), 'change')
    git(managed.path, 'add', 'change')
    git(managed.path, 'commit', '-m', 'change')
    git(root, 'merge', '--no-ff', managed.branchName, '-m', 'integrate')
    await managed.lease.release()
    expect(await sweepWorktrees(root, false, temporaryRoot)).toEqual([
      {
        path: managed.path,
        status: 'retained',
        reason: 'eligible; preview only',
      },
    ])
    expect(await sweepWorktrees(root, true, temporaryRoot)).toEqual([
      { path: managed.path, status: 'removed', reason: 'removed' },
    ])
    expect(git(root, 'branch', '--show-current')).toBe('prerelease/3.0.0')
    expect(git(root, 'branch', '--list', managed.branchName)).toBe(
      managed.branchName,
    )
  } finally {
    if (managed) {
      cleanupGit(root, 'worktree', 'remove', managed.path)
      cleanupGit(root, 'branch', '-D', managed.branchName)
    }
    rmSync(temporaryRoot, { recursive: true, force: true })
  }
})

test('retains clean but unmerged worktrees and dirty or ignored worktrees', async () => {
  const { temporaryRoot, root } = makeRepository()
  const managed = await makeManaged(root, temporaryRoot)
  try {
    writeFileSync(path.join(managed.path, 'change'), 'change')
    git(managed.path, 'add', 'change')
    git(managed.path, 'commit', '-m', 'change')
    expect(
      (await sweepWorktrees(root, true, temporaryRoot))[0]?.reason,
    ).toContain('not an ancestor')
    git(root, 'merge', '--no-ff', managed.branchName, '-m', 'integrate')
    writeFileSync(path.join(managed.path, '.gitignore'), 'ignored\n')
    git(managed.path, 'add', '.gitignore')
    git(managed.path, 'commit', '-m', 'ignore local output')
    git(
      root,
      'merge',
      '--no-ff',
      managed.branchName,
      '-m',
      'integrate ignored rule',
    )
    writeFileSync(path.join(managed.path, 'ignored'), 'local')
    expect(
      (await sweepWorktrees(root, true, temporaryRoot))[0]?.reason,
    ).toContain('ignored')
  } finally {
    await managed.lease.release()
    cleanupGit(root, 'worktree', 'remove', managed.path, '--force')
    cleanupGit(root, 'branch', '-D', managed.branchName)
    rmSync(temporaryRoot, { recursive: true, force: true })
  }
})

test('retains an expired pulse from a dead runner for review', async () => {
  const { temporaryRoot, root } = makeRepository()
  const managed = await makeManaged(root, temporaryRoot)
  try {
    writeFileSync(path.join(managed.path, 'change'), 'change')
    git(managed.path, 'add', 'change')
    git(managed.path, 'commit', '-m', 'change')
    git(root, 'merge', '--no-ff', managed.branchName, '-m', 'integrate')
    await managed.lease.release()
    const pulsePath = path.join(
      path.dirname(managed.path),
      '.nwsapi-pulse.json',
    )
    writeFileSync(
      pulsePath,
      JSON.stringify({
        pid: 999_999_999,
        token: managed.lease.token,
        hostname: hostname(),
        refreshedAt: 1,
      }),
    )
    expect(
      (await sweepWorktrees(root, true, temporaryRoot))[0]?.reason,
    ).toContain('ended without a verified clean release')
    expect(
      parseWorktreeInventory(git(root, 'worktree', 'list', '--porcelain')).map(
        item => item.path && foldPathForCompare(item.path),
      ),
    ).toContain(foldPathForCompare(managed.path))
  } finally {
    cleanupGit(root, 'worktree', 'remove', managed.path, '--force')
    cleanupGit(root, 'branch', '-D', managed.branchName)
    rmSync(temporaryRoot, { recursive: true, force: true })
  }
})

test('retains an absent pulse without a token-matched clean release marker', async () => {
  const { temporaryRoot, root } = makeRepository()
  const managed = await makeManaged(root, temporaryRoot)
  try {
    writeFileSync(path.join(managed.path, 'change'), 'change')
    git(managed.path, 'add', 'change')
    git(managed.path, 'commit', '-m', 'change')
    git(root, 'merge', '--no-ff', managed.branchName, '-m', 'integrate')
    rmSync(path.join(path.dirname(managed.path), '.nwsapi-pulse.json'))
    await managed.lease.release()
    expect(
      (await sweepWorktrees(root, true, temporaryRoot))[0]?.reason,
    ).toContain('without a matching clean release')
  } finally {
    cleanupGit(root, 'worktree', 'remove', managed.path, '--force')
    cleanupGit(root, 'branch', '-D', managed.branchName)
    rmSync(temporaryRoot, { recursive: true, force: true })
  }
})
