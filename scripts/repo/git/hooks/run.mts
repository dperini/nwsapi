import { execFileSync, spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { isMainModule } from '../../lib/run-node.mts'
import { withoutExternalGitContext } from '../../lib/external-git-environment.mts'
import { REPO_ROOT } from '../../lib/paths.mts'
import { managedEnvironment } from '../../setup/manager.mts'
import { checkCode } from '../../check/run.mts'
import {
  completePlan,
  planCiTests,
  runNodePlan,
  type CiTestPlan,
} from '../../test/ci.mts'

export interface PushRef {
  localRef: string
  localSha: string
  remoteRef: string
  remoteSha: string
}

export interface ChangedPaths {
  files: string[]
  deleted: string[]
}

export interface PushHookDependencies {
  runGit(args: string[]): { status: number; stdout: string }
  runChecks(): void
  runNodePlan(plan: CiTestPlan): Promise<void>
  log(message: string): void
  error(message: string): void
}

export function configureHookEnvironment(env = process.env) {
  const managed = managedEnvironment(undefined, env)
  for (const name of Object.keys(env)) {
    if (!(name in managed)) {
      delete env[name]
    }
  }
  Object.assign(env, managed)
  return env
}

export function parsePushRefs(input: string): PushRef[] {
  const refs: PushRef[] = []
  for (const line of input.split(/\r?\n/)) {
    if (!line.trim()) {
      continue
    }
    const fields = line.trim().split(/\s+/)
    if (fields.length !== 4) {
      throw new Error(`Invalid pre-push ref update: ${line}`)
    }
    const [localRef, localSha, remoteRef, remoteSha] = fields
    if (!localRef || !localSha || !remoteRef || !remoteSha) {
      throw new Error(`Invalid pre-push ref update: ${line}`)
    }
    refs.push({ localRef, localSha, remoteRef, remoteSha })
  }
  return refs
}

export function defaultDependencies(): PushHookDependencies {
  return {
    runGit(args) {
      try {
        return {
          status: 0,
          stdout: execFileSync('git', args, {
            cwd: REPO_ROOT,
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'ignore'],
          }),
        }
      } catch (error) {
        const result = error as { status?: number; stdout?: Buffer | string }
        return {
          status: result.status ?? 1,
          stdout: String(result.stdout ?? ''),
        }
      }
    },
    runChecks: checkCode,
    runNodePlan,
    log: message => console.log(message),
    error: message => console.error(message),
  }
}

export function gitOutput(
  dependencies: PushHookDependencies,
  args: string[],
): string | undefined {
  const result = dependencies.runGit(args)
  return result.status === 0 ? result.stdout.trim() : undefined
}

export function parseChangedPaths(output: string): ChangedPaths {
  const entries = output.split('\0')
  const files: string[] = []
  const deleted: string[] = []

  for (let index = 0; index < entries.length;) {
    const status = entries[index++]
    if (!status) {
      continue
    }
    if (status.startsWith('R') || status.startsWith('C')) {
      const previous = entries[index++]
      const current = entries[index++]
      if (previous) {
        files.push(previous)
        if (status.startsWith('R')) {
          deleted.push(previous)
        }
      }
      if (current) {
        files.push(current)
      }
      continue
    }
    const file = entries[index++]
    if (file) {
      files.push(file)
      if (status === 'D') {
        deleted.push(file)
      }
    }
  }

  return { files, deleted }
}

export function rawGitOutput(
  dependencies: PushHookDependencies,
  args: string[],
): string | undefined {
  const result = dependencies.runGit(args)
  return result.status === 0 ? result.stdout : undefined
}

export function currentExitStatus() {
  return typeof process.exitCode === 'number'
    ? process.exitCode
    : process.exitCode
      ? 1
      : 0
}

export function validatePush(
  updates: PushRef[],
  dependencies: PushHookDependencies,
): string | undefined {
  const head = gitOutput(dependencies, ['rev-parse', 'HEAD'])
  const pushedCommits = updates.map(ref =>
    gitOutput(dependencies, [
      'rev-parse',
      '--verify',
      `${ref.localSha}^{commit}`,
    ]),
  )
  if (!head || pushedCommits.some(commit => commit !== head)) {
    dependencies.error(
      '[hooks] Push checks require every pushed commit to match the current HEAD. Check out each pushed commit and rerun the push.',
    )
    return undefined
  }

  const status = gitOutput(dependencies, [
    'status',
    '--porcelain=v1',
    '--untracked-files=all',
  ])
  if (status === undefined) {
    dependencies.error('[hooks] Could not inspect the checkout status.')
    return undefined
  }
  if (status !== '') {
    dependencies.error(
      '[hooks] Push checks require a clean checkout so they match the pushed commit. Commit, stash, or remove the listed changes, then retry.',
    )
    dependencies.error(status)
    return undefined
  }
  return head
}

export function addPaths(target: Set<string>, files: string[]) {
  for (const file of files) {
    target.add(file)
  }
}

export function containsDeletedTest(paths: Set<string>) {
  return [...paths].some(file =>
    /^test\/repo\/(unit|integration)\/.*\.test\.mts$/.test(file),
  )
}

export function collectRemoteChanges(
  remoteBases: string[],
  head: string,
  dependencies: PushHookDependencies,
): ChangedPaths | undefined {
  const files = new Set<string>()
  const deleted = new Set<string>()
  for (const base of remoteBases) {
    const mergeBase = gitOutput(dependencies, ['merge-base', base, head])
    if (!mergeBase) {
      dependencies.log(
        '[hooks] Remote base is unavailable; running the full Node test plan.',
      )
      return undefined
    }
    const output = rawGitOutput(dependencies, [
      'diff',
      '--name-status',
      '--diff-filter=ACMRD',
      '-z',
      `${mergeBase}...${head}`,
    ])
    if (output === undefined) {
      dependencies.log(
        '[hooks] Could not resolve the remote change set; running the full Node test plan.',
      )
      return undefined
    }
    const paths = parseChangedPaths(output)
    addPaths(files, paths.files)
    addPaths(deleted, paths.deleted)
  }
  return { files: [...files], deleted: [...deleted] }
}

export async function planPush(
  remoteBases: string[],
  head: string,
  dependencies: PushHookDependencies,
): Promise<CiTestPlan> {
  if (remoteBases.some(sha => /^0+$/.test(sha))) {
    dependencies.log(
      '[hooks] New remote branch detected; running the full Node test plan.',
    )
    return completePlan()
  }

  const changed = collectRemoteChanges(remoteBases, head, dependencies)
  if (!changed) {
    return completePlan()
  }
  if (containsDeletedTest(new Set(changed.deleted))) {
    dependencies.log(
      '[hooks] A test suite was removed; running the full Node test plan.',
    )
    return completePlan()
  }
  dependencies.log(
    `[hooks] Running the existing CI Node plan for ${changed.files.length} changed paths.`,
  )
  return planCiTests(changed.files)
}

export async function runPrePush(
  input: string,
  dependencies = defaultDependencies(),
): Promise<number> {
  let refs: PushRef[]
  try {
    refs = parsePushRefs(input)
  } catch (error) {
    dependencies.error(error instanceof Error ? error.message : String(error))
    return 1
  }
  const updates = refs.filter(ref => !/^0+$/.test(ref.localSha))
  if (updates.length === 0) {
    dependencies.log('[hooks] Deletion-only push; no Node checks are needed.')
    return 0
  }

  const head = validatePush(updates, dependencies)
  if (!head) {
    return 1
  }

  const remoteBases = [...new Set(updates.map(ref => ref.remoteSha))]
  const plan = await planPush(remoteBases, head, dependencies)
  try {
    dependencies.runChecks()
  } catch (error) {
    dependencies.error(
      `[hooks] Main repository checks failed: ${error instanceof Error ? error.message : String(error)}`,
    )
    return 1
  }
  const checkStatus = currentExitStatus()
  if (checkStatus !== 0) {
    dependencies.error(
      `[hooks] Main repository checks exited with status ${checkStatus}.`,
    )
    return checkStatus
  }
  if (validatePush(updates, dependencies) !== head) {
    return 1
  }
  try {
    await withoutExternalGitContext(() => dependencies.runNodePlan(plan))
  } catch (error) {
    dependencies.error(
      `[hooks] CI Node checks failed: ${error instanceof Error ? error.message : String(error)}`,
    )
    return 1
  }
  const planStatus = currentExitStatus()
  if (planStatus !== 0) {
    return planStatus
  }
  return validatePush(updates, dependencies) === head ? 0 : 1
}

export function runPreCommit() {
  const result = spawnSync(
    process.execPath,
    [path.join(REPO_ROOT, 'scripts/repo/git/staged-check.mts')],
    { cwd: REPO_ROOT, stdio: 'inherit' },
  )
  if (result.error) {
    console.error(
      `[hooks] Could not run staged checks: ${result.error.message}`,
    )
    return 1
  }
  if (result.signal) {
    console.error(`[hooks] Staged checks ended on signal ${result.signal}.`)
    return 1
  }
  return result.status ?? 1
}

if (isMainModule(import.meta.url)) {
  configureHookEnvironment()
  const hook = process.argv[2]
  if (hook === 'pre-commit') {
    process.exitCode = runPreCommit()
  } else if (hook === 'pre-push') {
    process.exitCode = await runPrePush(readFileSync(0, 'utf8'))
  } else {
    console.error(
      'Usage: node scripts/repo/git/hooks/run.mts <pre-commit|pre-push>',
    )
    process.exitCode = 2
  }
}
