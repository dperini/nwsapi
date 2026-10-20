import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { readdir, readFile, realpath, rm, rmdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { hostname } from 'node:os'
import path from 'node:path'
import { foldPathForCompare, isPathWithinRoot } from '../../lib/paths.mts'
import type { WorktreeMetadata } from './lease.mts'
import { inspectPulse, lockWorktree } from './lease.mts'

interface Candidate {
  metadataPath: string
  pulsePath: string
  parent: string
  metadata: WorktreeMetadata
}

export function git(repository: string, args: string[]) {
  return execFileSync('git', args, {
    cwd: repository,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  }).trim()
}

export function worktreeInventory(repository: string) {
  return parseWorktreeInventory(
    git(repository, ['worktree', 'list', '--porcelain']),
  )
}

export function parseWorktreeInventory(output: string) {
  return output
    .trim()
    .split(/\r?\n\r?\n/)
    .filter(Boolean)
    .map(block => {
      const fields = new Map<string, string>()
      for (const line of block.split(/\r?\n/)) {
        const [key, ...rest] = line.split(' ')
        fields.set(key!, rest.join(' '))
      }
      return {
        path: fields.get('worktree'),
        branch: fields.get('branch')?.replace('refs/heads/', ''),
        locked: fields.has('locked'),
      }
    })
}

export function candidatePathsMatch(
  metadata: Pick<WorktreeMetadata, 'repository'>,
  paths: {
    parent: string
    temporaryRoot: string
    repository: string
    checkout: string
  },
) {
  const parent = foldPathForCompare(paths.parent)
  const temporaryRoot = foldPathForCompare(paths.temporaryRoot)
  return (
    parent !== temporaryRoot &&
    isPathWithinRoot(parent, temporaryRoot) &&
    foldPathForCompare(paths.repository) ===
      foldPathForCompare(metadata.repository) &&
    foldPathForCompare(paths.checkout) ===
      foldPathForCompare(path.join(parent, 'checkout'))
  )
}

export async function findCandidates(
  repository: string,
  temporaryRoot: string,
): Promise<Candidate[]> {
  const entries = await readdir(temporaryRoot, { withFileTypes: true })
  const canonicalTemp = foldPathForCompare(await realpath(temporaryRoot))
  const commonDirectory = git(repository, ['rev-parse', '--git-common-dir'])
  const canonicalRepository = foldPathForCompare(
    await realpath(path.resolve(repository, commonDirectory)),
  )
  const candidates: Candidate[] = []
  for (const entry of entries) {
    if (!entry.isDirectory() || !entry.name.startsWith('nwsapi-worktree-')) {
      continue
    }
    const parent = path.join(temporaryRoot, entry.name)
    const metadataPath = path.join(parent, '.nwsapi-worktree.json')
    try {
      const metadata = JSON.parse(
        await readFile(metadataPath, 'utf8'),
      ) as WorktreeMetadata
      const canonicalParent = await realpath(parent)
      const canonicalCheckout = await realpath(metadata.path)
      if (
        !candidatePathsMatch(metadata, {
          parent: canonicalParent,
          temporaryRoot: canonicalTemp,
          repository: canonicalRepository,
          checkout: canonicalCheckout,
        }) ||
        metadata.schemaVersion !== 1
      ) {
        continue
      }
      if (
        !metadata.sourceBranch ||
        !metadata.sourceHead ||
        !metadata.targetBranch ||
        !metadata.leaseToken ||
        metadata.hostname !== hostname() ||
        !['v2', 'v3'].includes(metadata.version)
      ) {
        continue
      }
      candidates.push({
        metadataPath,
        pulsePath: path.join(parent, '.nwsapi-pulse.json'),
        parent,
        metadata,
      })
    } catch {
      // Unreadable or incomplete metadata is never an owned cleanup candidate.
    }
  }
  return candidates
}

export function hasTarget(repository: string, target: string) {
  if (
    !/^[A-Za-z0-9._/-]+$/.test(target) ||
    target.startsWith('-') ||
    target.includes('..')
  ) {
    return false
  }
  return (
    spawnSync(
      'git',
      ['show-ref', '--verify', '--quiet', `refs/heads/${target}`],
      {
        cwd: repository,
      },
    ).status === 0
  )
}

export async function candidateReason(
  repository: string,
  candidate: Candidate,
  inventory: ReturnType<typeof worktreeInventory>,
  currentPath: string,
) {
  const checkout = checkoutReason(repository, candidate, inventory, currentPath)
  if (checkout) {
    return checkout
  }
  const integration = integrationReason(repository, candidate.metadata)
  if (integration) {
    return integration
  }
  return ownershipReason(candidate)
}

export function checkoutReason(
  repository: string,
  candidate: Candidate,
  inventory: ReturnType<typeof worktreeInventory>,
  currentPath: string,
) {
  const { metadata } = candidate
  if (existsSync(path.join(candidate.parent, '.nwsapi-operation.lock'))) {
    return 'worktree operation is in progress or uncertain'
  }
  const checkoutPath = foldPathForCompare(metadata.path)
  const registered = inventory.find(
    item => item.path && foldPathForCompare(item.path) === checkoutPath,
  )
  if (!registered) {
    return 'checkout is absent from Git worktree inventory'
  }
  if (
    registered.branch !== metadata.sourceBranch ||
    registered.branch === metadata.targetBranch
  ) {
    return 'source branch changed or no longer matches helper metadata'
  }
  if (checkoutPath === foldPathForCompare(currentPath)) {
    return 'current checkout'
  }
  if (registered.locked) {
    return 'Git worktree is locked'
  }
  if (!hasTarget(repository, metadata.targetBranch)) {
    return `target branch ${metadata.targetBranch} is unavailable`
  }
  return undefined
}

export function integrationReason(
  repository: string,
  metadata: WorktreeMetadata,
) {
  const status = git(metadata.path, [
    'status',
    '--porcelain=v1',
    '--untracked-files=all',
    '--ignored=matching',
    '--ignore-submodules=none',
  ])
  if (status) {
    return 'checkout has modified, untracked, ignored, or submodule content'
  }
  const head = git(metadata.path, ['rev-parse', 'HEAD'])
  if (head === metadata.sourceHead) {
    return 'no commits beyond the recorded starting point'
  }
  const targetHead = git(repository, [
    'rev-parse',
    `refs/heads/${metadata.targetBranch}`,
  ])
  if (
    spawnSync('git', ['merge-base', '--is-ancestor', head, targetHead], {
      cwd: repository,
    }).status !== 0
  ) {
    return 'source HEAD is not an ancestor of the recorded target'
  }
  return undefined
}

export async function ownershipReason(candidate: Candidate) {
  const pulse = await inspectPulse(candidate.pulsePath)
  if (pulse.active) {
    return pulse.expired
      ? 'expired pulse has a live or uncertain owner'
      : 'runner is active'
  }
  if (pulse.reason === 'missing') {
    const stored = JSON.parse(
      await readFile(candidate.metadataPath, 'utf8'),
    ) as WorktreeMetadata
    if (
      !stored.leaseToken ||
      stored.releasedToken !== stored.leaseToken ||
      !Number.isFinite(stored.releasedAt)
    ) {
      return 'pulse state is missing or malformed without a matching clean release'
    }
  } else if (pulse.reason === 'process-dead') {
    return 'runner ended without a verified clean release; checkout retained for review'
  } else if (pulse.reason === 'invalid') {
    return 'pulse is malformed'
  } else if (pulse.reason === 'foreign-or-unknown') {
    return 'pulse host is unknown or different; checkout retained'
  }
  return undefined
}

export async function removeCandidate(
  repository: string,
  candidate: Candidate,
  currentPath: string,
) {
  const unlock = await lockWorktree(candidate.parent).catch(() => undefined)
  if (!unlock) {
    return 'worktree operation is locked or uncertain'
  }
  try {
    const reason = await finalRemovalReason(repository, candidate, currentPath)
    if (reason) {
      return reason
    }
    const latest = candidate.metadata
    execFileSync('git', ['worktree', 'remove', latest.path], {
      cwd: repository,
      stdio: 'ignore',
    })
    await rm(candidate.metadataPath, { force: true })
    await rm(candidate.pulsePath, { force: true })
    await unlock()
    try {
      await rmdir(candidate.parent)
    } catch {
      // Preserve any unrelated content left in the temporary parent.
    }
    return 'removed'
  } finally {
    await unlock()
  }
}

export async function finalRemovalReason(
  repository: string,
  candidate: Candidate,
  currentPath: string,
) {
  const latest = JSON.parse(
    await readFile(candidate.metadataPath, 'utf8'),
  ) as WorktreeMetadata
  const currentBranch = git(latest.path, [
    'symbolic-ref',
    '--quiet',
    '--short',
    'HEAD',
  ])
  if (!metadataMatches(candidate.metadata, latest, currentBranch)) {
    return 'metadata changed during sweep'
  }
  const head = git(latest.path, ['rev-parse', 'HEAD'])
  if (head === latest.sourceHead) {
    return 'source HEAD changed or has no integration commits'
  }
  const pulse = await inspectPulse(candidate.pulsePath)
  if (pulse.active || pulse.reason !== 'missing' || !releaseMatches(latest)) {
    return 'pulse or clean release marker changed during sweep'
  }
  if (
    git(latest.path, [
      'status',
      '--porcelain=v1',
      '--untracked-files=all',
      '--ignored=matching',
      '--ignore-submodules=none',
    ]) ||
    foldPathForCompare(path.resolve(latest.path)) ===
      foldPathForCompare(currentPath)
  ) {
    return 'checkout changed during sweep'
  }
  const targetHead = git(repository, [
    'rev-parse',
    `refs/heads/${latest.targetBranch}`,
  ])
  if (
    spawnSync('git', ['merge-base', '--is-ancestor', head, targetHead], {
      cwd: repository,
    }).status !== 0
  ) {
    return 'integration proof changed during sweep'
  }
  return undefined
}

export function metadataMatches(
  previous: WorktreeMetadata,
  latest: WorktreeMetadata,
  branch: string,
) {
  return (
    foldPathForCompare(latest.path) === foldPathForCompare(previous.path) &&
    foldPathForCompare(latest.repository) ===
      foldPathForCompare(previous.repository) &&
    latest.sourceBranch === previous.sourceBranch &&
    latest.sourceHead === previous.sourceHead &&
    latest.targetBranch === previous.targetBranch &&
    latest.version === previous.version &&
    latest.hostname === previous.hostname &&
    latest.schemaVersion === previous.schemaVersion &&
    latest.leaseToken === previous.leaseToken &&
    latest.releasedToken === previous.releasedToken &&
    branch === latest.sourceBranch &&
    branch !== latest.targetBranch
  )
}

export function releaseMatches(metadata: WorktreeMetadata) {
  return (
    Boolean(metadata.leaseToken) &&
    metadata.releasedToken === metadata.leaseToken &&
    Number.isFinite(metadata.releasedAt)
  )
}

export async function sweepWorktrees(
  repository: string,
  apply: boolean,
  temporaryRoot = tmpdir(),
) {
  const root = await realpath(repository)
  const currentPath = root
  const inventory = worktreeInventory(root)
  const candidates = await findCandidates(root, temporaryRoot)
  const results = []
  for (const candidate of candidates) {
    let reason: string | undefined
    try {
      reason = await candidateReason(root, candidate, inventory, currentPath)
      if (!reason && apply) {
        reason = await removeCandidate(root, candidate, currentPath)
      }
    } catch {
      reason = 'Git or ownership state is uncertain'
    }
    results.push({
      path: candidate.metadata.path,
      status: reason === 'removed' ? 'removed' : 'retained',
      reason: reason ?? 'eligible; preview only',
    })
  }
  return results
}
