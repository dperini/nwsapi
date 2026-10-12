import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { readFileSync, realpathSync } from 'node:fs'
import { hostname } from 'node:os'
import path from 'node:path'
import { runProcess } from '../process.mts'
import { claimWorktree } from '../worktree/lease.mts'
import { createVersionCheckout, resolveVersion } from './select.mts'
import type { WorktreeMetadata } from '../worktree/lease.mts'

function readCurrentMetadata(repository: string, commonDirectory: string) {
  const file = path.join(path.dirname(repository), '.nwsapi-worktree.json')
  try {
    const metadata = JSON.parse(readFileSync(file, 'utf8')) as WorktreeMetadata
    if (
      metadata.schemaVersion === 1 &&
      metadata.path === realpathSync(repository) &&
      metadata.repository === commonDirectory &&
      metadata.hostname === hostname() &&
      ['v2', 'v3'].includes(metadata.version) &&
      Boolean(metadata.leaseToken)
    ) {
      return metadata
    }
  } catch {
    // An unrecognized record cannot claim the current checkout's version.
  }
  return undefined
}

export async function runVersion(
  version: 'v2' | 'v3',
  args: string[],
  repositoryInput = process.cwd(),
) {
  const context = readCheckoutContext(repositoryInput)
  const { checkout, lease } = await prepareSelectedCheckout(context, version)
  console.error(`Selected ${version}: ${checkout.path}`)
  try {
    await launchVersionRunner(
      context.repository,
      checkout.path,
      version,
      args,
      lease.token,
    )
  } finally {
    await lease.release()
  }
}

interface CheckoutContext {
  repository: string
  commonDirectory: string
  sourceBranch: string
  sourceHead: string
  currentVersion: 'v2' | 'v3'
  helperMetadata?: WorktreeMetadata | undefined
}

function readCheckoutContext(repositoryInput: string): CheckoutContext {
  const repository = gitValue(repositoryInput, ['rev-parse', '--show-toplevel'])
  const commonDirectory = path.resolve(
    repository,
    gitValue(repository, ['rev-parse', '--git-common-dir']),
  )
  const sourceBranch = gitValue(repository, ['branch', '--show-current'])
  const sourceHead = gitValue(repository, ['rev-parse', 'HEAD'])
  const helperMetadata = readCurrentMetadata(repository, commonDirectory)
  const currentVersion = identifyCurrentVersion(
    repository,
    sourceBranch,
    helperMetadata,
  )
  return {
    repository,
    commonDirectory,
    sourceBranch,
    sourceHead,
    currentVersion,
    helperMetadata,
  }
}

function gitValue(repository: string, args: string[]) {
  return execFileSync('git', args, { cwd: repository, encoding: 'utf8' }).trim()
}

function identifyCurrentVersion(
  repository: string,
  sourceBranch: string,
  metadata?: WorktreeMetadata,
): 'v2' | 'v3' {
  const metadataPath = path.join(
    path.dirname(repository),
    '.nwsapi-worktree.json',
  )
  if (
    existsSync(metadataPath) &&
    !metadata &&
    path.basename(path.dirname(repository)).startsWith('nwsapi-worktree-')
  ) {
    throw new Error(
      `Worktree ownership metadata at ${metadataPath} is unknown or belongs to another host. Preserve it and inspect the checkout before continuing.`,
    )
  }
  const v2Runner = existsSync(path.join(repository, 'scripts/develop/run.mts'))
  const v3Runner = existsSync(
    path.join(repository, 'scripts/repo/develop/run.mts'),
  )
  const version =
    metadata?.version ??
    (sourceBranch === 'master'
      ? 'v2'
      : sourceBranch === 'prerelease/3.0.0'
        ? 'v3'
        : v2Runner !== v3Runner
          ? v2Runner
            ? 'v2'
            : 'v3'
          : undefined)
  if (!version) {
    throw new Error(
      `Cannot identify the current product checkout at ${repository}. Both supported runner layouts are ${v2Runner ? 'present' : 'absent'}.`,
    )
  }
  return version
}

async function prepareSelectedCheckout(
  context: CheckoutContext,
  version: 'v2' | 'v3',
) {
  const current = context.currentVersion === version
  const checkout = current
    ? { path: context.repository, branchName: context.sourceBranch }
    : createVersionCheckout(context.repository, version)
  const selection = resolveVersion(version)
  const pulsePath = current
    ? context.helperMetadata?.version === version
      ? path.join(path.dirname(context.repository), '.nwsapi-pulse.json')
      : path.join(context.repository, '.cache', 'develop', 'version-pulse.json')
    : path.join(path.dirname(checkout.path), '.nwsapi-pulse.json')
  const sourceHead = current
    ? context.sourceHead
    : gitValue(checkout.path, ['rev-parse', 'HEAD'])
  const lease = await claimWorktree(
    {
      schemaVersion: 1,
      repository: context.commonDirectory,
      path: checkout.path,
      version,
      sourceBranch: checkout.branchName,
      sourceHead,
      targetBranch: selection.branch,
      owner: `runner:${process.pid}`,
    },
    pulsePath,
    !current || context.helperMetadata?.version === version,
  )
  return { checkout, lease }
}

async function launchVersionRunner(
  repository: string,
  checkout: string,
  version: 'v2' | 'v3',
  args: string[],
  token: string,
) {
  const runner = path.join(
    checkout,
    version === 'v2'
      ? 'scripts/develop/run.mts'
      : 'scripts/repo/develop/run.mts',
  )
  if (!existsSync(runner)) {
    const message = `${version} guided runner is unavailable. Continue in ${checkout} with commands listed in that checkout's package.json.`
    console.error(message)
    if (args.includes('--json')) {
      console.log(
        JSON.stringify({
          schemaVersion: 1,
          type: 'result',
          task: null,
          status: 'failed',
          exitCode: 2,
          signal: null,
          message,
          next: null,
        }),
      )
    }
    process.exitCode = 2
    return
  }
  const env = selectedRunnerEnvironment(repository, checkout, token)
  const interactive =
    process.stdin.isTTY === true &&
    process.stdout.isTTY === true &&
    !args.some(arg => arg === '--task' || arg.startsWith('--task='))
  const result = await runProcess(
    { command: process.execPath, args: [runner, ...args], cwd: checkout, env },
    { interactive, terminalOwner: interactive },
  )
  process.exitCode = result.code ?? (result.signal === 'SIGTERM' ? 143 : 130)
}

function selectedRunnerEnvironment(
  repository: string,
  checkout: string,
  token: string,
) {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    NWSAPI_WORKTREE_LEASE_TOKEN: token,
    NWSAPI_WORKTREE_PATH: checkout,
  }
  if (env['PATH']) {
    env['PATH'] = env['PATH']
      .split(path.delimiter)
      .filter(
        entry => path.resolve(entry) !== path.join(repository, '.cache', 'bin'),
      )
      .join(path.delimiter)
  }
  const selectedBin = path.join(checkout, '.cache', 'bin')
  if (existsSync(selectedBin)) {
    env['PATH'] = `${selectedBin}${path.delimiter}${env['PATH'] ?? ''}`
  }
  return env
}
