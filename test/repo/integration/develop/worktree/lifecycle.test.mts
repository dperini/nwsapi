import { execFileSync } from 'node:child_process'
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  rmdirSync,
  writeFileSync,
} from 'node:fs'
import { hostname, tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, expect, test } from 'vitest'
import {
  claimWorktree,
  lockWorktree,
} from '../../../../../scripts/repo/develop/worktree/lease.mts'
import { sweepWorktrees } from '../../../../../scripts/repo/develop/worktree/sweep.mts'
import { createVersionCheckout } from '../../../../../scripts/repo/develop/version/select.mts'

interface ManagedCheckout {
  root: string
  path: string
  parent: string
  branchName: string
  metadataPath: string
  pulsePath: string
  metadata: {
    schemaVersion: 1
    repository: string
    path: string
    version: 'v3'
    sourceBranch: string
    sourceHead: string
    targetBranch: string
    owner: string
    hostname?: string
    leaseToken?: string
    releasedToken?: string
    releasedAt?: number
  }
  lease: Awaited<ReturnType<typeof claimWorktree>>
}

const fixtures = new Set<ManagedCheckout>()

function git(root: string, ...args: string[]) {
  return execFileSync('git', args, {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  }).trim()
}

function makeRepository() {
  const root = mkdtempSync(path.join(tmpdir(), 'nwsapi-lifecycle-fixture-'))
  git(root, 'init', '-b', 'prerelease/3.0.0')
  git(root, 'config', 'user.email', 'fixture@example.test')
  git(root, 'config', 'user.name', 'Fixture')
  writeFileSync(path.join(root, 'tracked'), 'base')
  git(root, 'add', 'tracked')
  git(root, 'commit', '-m', 'base')
  return realpathSync(root)
}

async function makeManaged(options: { merge?: boolean } = {}) {
  const root = makeRepository()
  const selected = createVersionCheckout(root, 'v3')
  const metadataPath = path.join(
    path.dirname(selected.path),
    '.nwsapi-worktree.json',
  )
  const pulsePath = path.join(path.dirname(selected.path), '.nwsapi-pulse.json')
  const metadata: ManagedCheckout['metadata'] = {
    schemaVersion: 1,
    repository: path.resolve(root, git(root, 'rev-parse', '--git-common-dir')),
    path: selected.path,
    version: 'v3',
    sourceBranch: selected.branchName,
    sourceHead: git(selected.path, 'rev-parse', 'HEAD'),
    targetBranch: 'prerelease/3.0.0',
    owner: 'lifecycle-test',
  }
  const lease = await claimWorktree(metadata)
  const fixture = {
    root,
    path: selected.path,
    parent: path.dirname(selected.path),
    branchName: selected.branchName,
    metadataPath,
    pulsePath,
    metadata,
    lease,
  }
  fixtures.add(fixture)
  if (options.merge !== false) {
    integrateChange(fixture)
    await lease.release()
  }
  return fixture
}

function integrateChange(fixture: ManagedCheckout) {
  writeFileSync(path.join(fixture.path, 'integration-change'), 'change')
  git(fixture.path, 'add', 'integration-change')
  git(fixture.path, 'commit', '-m', 'worktree change')
  git(fixture.root, 'merge', '--no-ff', fixture.branchName, '-m', 'integrate')
}

function readMetadata(fixture: ManagedCheckout) {
  return JSON.parse(readFileSync(fixture.metadataPath, 'utf8')) as Record<
    string,
    unknown
  >
}

function writeMetadata(
  fixture: ManagedCheckout,
  update: Record<string, unknown>,
) {
  writeFileSync(
    fixture.metadataPath,
    JSON.stringify({ ...readMetadata(fixture), ...update }),
  )
}

function inventoryContains(fixture: ManagedCheckout) {
  return git(fixture.root, 'worktree', 'list', '--porcelain').includes(
    fixture.path,
  )
}

afterEach(async () => {
  for (const fixture of fixtures) {
    await fixture.lease.release()
    try {
      git(fixture.root, 'worktree', 'unlock', fixture.path)
    } catch {
      // The fixture may not have been locked or the sweep removed it.
    }
    try {
      git(fixture.root, 'worktree', 'remove', '--force', fixture.path)
    } catch {
      // The sweep may already have removed this fixture checkout.
    }
    try {
      git(fixture.root, 'branch', '-D', fixture.branchName)
    } catch {
      // The branch may already be absent after fixture cleanup.
    }
    rmSync(fixture.metadataPath, { force: true })
    rmSync(fixture.pulsePath, { force: true })
    try {
      rmdirSync(fixture.parent)
    } catch {
      // Preserve any unrelated content in the owned temporary parent.
    }
    rmSync(fixture.root, { recursive: true, force: true })
    fixtures.delete(fixture)
  }
})

test.each([
  ['current checkout', 'current checkout'],
  ['source branch mismatch', 'source branch changed or no longer matches'],
  ['Git worktree lock', 'Git worktree is locked'],
  [
    'missing target branch',
    'target branch agent/missing-target is unavailable',
  ],
  ['live runner pulse', 'runner is active'],
  ['untracked content', 'modified, untracked, ignored, or submodule content'],
  ['staged content', 'modified, untracked, ignored, or submodule content'],
  ['ignored content', 'ignored'],
] as const)(
  'retains a managed checkout with %s',
  async (condition, expected) => {
    const fixture = await makeManaged()
    if (condition === 'current checkout') {
      expect(await sweepWorktrees(fixture.path, true)).toMatchObject([
        { status: 'retained', reason: expected },
      ])
    } else {
      if (condition === 'source branch mismatch') {
        const renamed = `${fixture.branchName}-renamed`
        git(fixture.root, 'branch', '-m', fixture.branchName, renamed)
        fixture.branchName = renamed
      }
      if (condition === 'Git worktree lock') {
        git(
          fixture.root,
          'worktree',
          'lock',
          '--reason',
          'fixture',
          fixture.path,
        )
      }
      if (condition === 'missing target branch') {
        writeMetadata(fixture, { targetBranch: 'agent/missing-target' })
      }
      if (condition === 'live runner pulse') {
        writeFileSync(
          fixture.pulsePath,
          JSON.stringify({
            pid: process.pid,
            token: fixture.lease.token,
            hostname: hostname(),
            refreshedAt: Date.now(),
          }),
        )
      }
      if (condition === 'untracked content') {
        writeFileSync(path.join(fixture.path, 'local-untracked'), 'local')
      }
      if (condition === 'staged content') {
        writeFileSync(path.join(fixture.path, 'local-staged'), 'local')
        git(fixture.path, 'add', 'local-staged')
      }
      if (condition === 'ignored content') {
        writeFileSync(path.join(fixture.path, '.gitignore'), 'ignored-local\n')
        git(fixture.path, 'add', '.gitignore')
        git(fixture.path, 'commit', '-m', 'ignore local output')
        git(
          fixture.root,
          'merge',
          '--no-ff',
          fixture.branchName,
          '-m',
          'integrate ignore rule',
        )
        writeFileSync(path.join(fixture.path, 'ignored-local'), 'local')
      }
      expect(await sweepWorktrees(fixture.root, true)).toMatchObject([
        { status: 'retained', reason: expect.stringContaining(expected) },
      ])
    }
    expect(inventoryContains(fixture)).toBe(true)
  },
)

test.each([
  ['malformed metadata', 'metadata', ''],
  ['malformed pulse', 'pulse', 'not-json'],
  ['foreign-host pulse', 'pulse', 'foreign'],
] as const)(
  'retains a managed checkout with %s',
  async (_label, kind, value) => {
    const fixture = await makeManaged()
    if (kind === 'metadata') {
      writeFileSync(fixture.metadataPath, value)
      expect(await sweepWorktrees(fixture.root, true)).toEqual([])
    } else {
      const pulse =
        value === 'foreign'
          ? JSON.stringify({
              pid: process.pid,
              token: fixture.lease.token,
              hostname: `${hostname()}-elsewhere`,
              refreshedAt: Date.now(),
            })
          : value
      writeFileSync(fixture.pulsePath, pulse)
      const result = await sweepWorktrees(fixture.root, true)
      expect(result).toMatchObject([
        {
          status: 'retained',
          reason: expect.stringContaining(
            value === 'foreign'
              ? 'host is unknown or different'
              : 'pulse is malformed',
          ),
        },
      ])
    }
    expect(inventoryContains(fixture)).toBe(true)
  },
)

test('retains a clean checkout with no commits beyond its recorded source head', async () => {
  const fixture = await makeManaged({ merge: false })
  await fixture.lease.release()

  expect(await sweepWorktrees(fixture.root, true)).toMatchObject([
    {
      status: 'retained',
      reason: 'no commits beyond the recorded starting point',
    },
  ])
  expect(inventoryContains(fixture)).toBe(true)
})

test('an operation lock prevents claiming and sweeping until released', async () => {
  const fixture = await makeManaged()
  const unlock = await lockWorktree(fixture.parent)
  try {
    await expect(claimWorktree(fixture.metadata)).rejects.toThrow(
      'worktree operation lock already exists',
    )
    expect(await sweepWorktrees(fixture.root, true)).toMatchObject([
      {
        status: 'retained',
        reason: 'worktree operation is in progress or uncertain',
      },
    ])
    expect(inventoryContains(fixture)).toBe(true)
  } finally {
    await unlock()
  }

  expect(await sweepWorktrees(fixture.root, true)).toMatchObject([
    { status: 'removed', reason: 'removed' },
  ])
  expect(existsSync(fixture.path)).toBe(false)
})

test('retains a checkout with foreign-host metadata without an eligible verdict', async () => {
  const fixture = await makeManaged()
  writeMetadata(fixture, { hostname: `${hostname()}-elsewhere` })

  expect(await sweepWorktrees(fixture.root, true)).toEqual([])
  expect(inventoryContains(fixture)).toBe(true)
})
