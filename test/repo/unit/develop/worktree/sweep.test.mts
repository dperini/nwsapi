import { expect, test } from 'vitest'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import os, { hostname } from 'node:os'
import path from 'node:path'
import { claimWorktree } from '../../../../../scripts/repo/develop/worktree/lease.mts'
import { sweepWorktrees } from '../../../../../scripts/repo/develop/worktree/sweep.mts'
import { createVersionCheckout } from '../../../../../scripts/repo/develop/version/select.mts'

function git(root: string, ...args: string[]) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim()
}

function repositoryIdentity(root: string) {
  return path.resolve(root, git(root, 'rev-parse', '--git-common-dir'))
}

function makeRepository() {
  const root = mkdtempSync(path.join(os.tmpdir(), 'nwsapi-sweep-fixture-'))
  git(root, 'init', '-b', 'prerelease/3.0.0')
  git(root, 'config', 'user.email', 'fixture@example.test')
  git(root, 'config', 'user.name', 'Fixture')
  writeFileSync(path.join(root, 'tracked'), 'base')
  git(root, 'add', 'tracked')
  git(root, 'commit', '-m', 'base')
  return realpathSync(root)
}

async function makeManaged(root: string) {
  const selected = createVersionCheckout(root, 'v3')
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
  const root = makeRepository()
  let managed: Awaited<ReturnType<typeof makeManaged>> | undefined
  try {
    managed = await makeManaged(root)
    writeFileSync(path.join(managed.path, 'change'), 'change')
    git(managed.path, 'add', 'change')
    git(managed.path, 'commit', '-m', 'change')
    git(root, 'merge', '--no-ff', managed.branchName, '-m', 'integrate')
    await managed.lease.release()
    expect(await sweepWorktrees(root, false)).toEqual([
      {
        path: managed.path,
        status: 'retained',
        reason: 'eligible; preview only',
      },
    ])
    expect(await sweepWorktrees(root, true)).toEqual([
      { path: managed.path, status: 'removed', reason: 'removed' },
    ])
    expect(git(root, 'branch', '--show-current')).toBe('prerelease/3.0.0')
    expect(git(root, 'branch', '--list', managed.branchName)).toBe(
      managed.branchName,
    )
  } finally {
    if (managed) {
      try {
        git(root, 'worktree', 'remove', managed.path)
      } catch {
        /* Already removed. */
      }
      try {
        git(root, 'branch', '-D', managed.branchName)
      } catch {
        /* Already absent. */
      }
    }
    rmSync(root, { recursive: true, force: true })
  }
})

test('retains clean but unmerged worktrees and dirty or ignored worktrees', async () => {
  const root = makeRepository()
  const managed = await makeManaged(root)
  try {
    writeFileSync(path.join(managed.path, 'change'), 'change')
    git(managed.path, 'add', 'change')
    git(managed.path, 'commit', '-m', 'change')
    expect((await sweepWorktrees(root, true))[0]?.reason).toContain(
      'not an ancestor',
    )
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
    expect((await sweepWorktrees(root, true))[0]?.reason).toContain('ignored')
  } finally {
    await managed.lease.release()
    try {
      git(root, 'worktree', 'remove', managed.path, '--force')
    } catch {
      /* Keep fixture cleanup independent. */
    }
    try {
      git(root, 'branch', '-D', managed.branchName)
    } catch {
      /* Already absent. */
    }
    rmSync(root, { recursive: true, force: true })
  }
})

test('retains an expired pulse from a dead runner for review', async () => {
  const root = makeRepository()
  const managed = await makeManaged(root)
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
    expect((await sweepWorktrees(root, true))[0]?.reason).toContain(
      'ended without a verified clean release',
    )
    expect(git(root, 'worktree', 'list', '--porcelain')).toContain(managed.path)
  } finally {
    try {
      git(root, 'worktree', 'remove', managed.path, '--force')
    } catch {
      /* Fixture cleanup only. */
    }
    try {
      git(root, 'branch', '-D', managed.branchName)
    } catch {
      /* Fixture cleanup only. */
    }
    rmSync(root, { recursive: true, force: true })
  }
})

test('retains an absent pulse without a token-matched clean release marker', async () => {
  const root = makeRepository()
  const managed = await makeManaged(root)
  try {
    writeFileSync(path.join(managed.path, 'change'), 'change')
    git(managed.path, 'add', 'change')
    git(managed.path, 'commit', '-m', 'change')
    git(root, 'merge', '--no-ff', managed.branchName, '-m', 'integrate')
    rmSync(path.join(path.dirname(managed.path), '.nwsapi-pulse.json'))
    await managed.lease.release()
    expect((await sweepWorktrees(root, true))[0]?.reason).toContain(
      'without a matching clean release',
    )
  } finally {
    try {
      git(root, 'worktree', 'remove', managed.path, '--force')
    } catch {
      /* Fixture cleanup only. */
    }
    try {
      git(root, 'branch', '-D', managed.branchName)
    } catch {
      /* Fixture cleanup only. */
    }
    rmSync(root, { recursive: true, force: true })
  }
})
