import { execFileSync } from 'node:child_process'
import { mkdtempSync, realpathSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { tmpdir } from 'node:os'
import path from 'node:path'

export type ProductVersion = 'v2' | 'v3'

const BRANCHES: Record<ProductVersion, string> = {
  v2: 'master',
  v3: 'prerelease/3.0.0',
}

export function resolveVersion(version: ProductVersion) {
  return { version, branch: BRANCHES[version] }
}

export function createVersionCheckout(
  repository: string,
  version: ProductVersion,
  run = execFileSync,
  temporaryRoot = tmpdir(),
) {
  const selection = resolveVersion(version)
  const inventory = run('git', ['worktree', 'list', '--porcelain'], {
    cwd: repository,
    encoding: 'utf8',
  }) as string
  const occupied = new Set(
    [...inventory.matchAll(/^branch refs\/heads\/(.+)$/gm)].map(
      match => match[1],
    ),
  )
  const localBranches = new Set(
    (
      run('git', ['branch', '--format=%(refname:short)'], {
        cwd: repository,
        encoding: 'utf8',
      }) as string
    )
      .split('\n')
      .filter(Boolean),
  )
  let branch = `agent/${version}-${randomUUID()}`
  while (occupied.has(branch) || localBranches.has(branch)) {
    branch = `agent/${version}-${randomUUID()}`
  }
  const parent = mkdtempSync(path.join(temporaryRoot, 'nwsapi-worktree-'))
  const checkout = path.join(parent, 'checkout')
  run('git', ['worktree', 'add', '-b', branch, checkout, selection.branch], {
    cwd: repository,
    stdio: ['ignore', 'ignore', 'inherit'],
  })
  return { ...selection, branchName: branch, path: realpathSync(checkout) }
}
