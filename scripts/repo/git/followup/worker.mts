import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
  readdirSync,
  renameSync,
  rmdirSync,
} from 'node:fs'
import os from 'node:os'
import { createHash } from 'node:crypto'
import path from 'node:path'
import {
  branch,
  canApply,
  changedFiles,
  git,
  gitPath,
  operationInProgress,
  assertAllowedChanges,
} from './git.mts'

export const FOLLOWUP_TRAILER = 'Quality-Followup-For'
export interface Job {
  root: string
  source: string
  ref: string
  directory: string
}
export interface Outcome {
  state: 'queued' | 'running' | 'unchanged' | 'ready' | 'applied' | 'failed'
  source: string
  branch?: string
  worktree?: string
  commit?: string
  message?: string
  pid?: number
}
export type QualityTask = (
  worktree: string,
  files: string[],
  sourceRoot: string,
) => Promise<string[]>

export function saveOutcome(job: Job, outcome: Omit<Outcome, 'source'>) {
  const temporary = path.join(job.directory, `status-${process.pid}.tmp`)
  writeFileSync(
    temporary,
    JSON.stringify({ ...outcome, source: job.source }, null, 2) + '\n',
  )
  renameSync(temporary, path.join(job.directory, 'status.json'))
}

export function queueJob(root: string): Job | undefined {
  if (
    process.env['QUALITY_FOLLOWUP_WORKER'] === '1' ||
    operationInProgress(root)
  ) {
    return undefined
  }
  const source = git(root, ['rev-parse', 'HEAD']).trim()
  if (
    new RegExp(`^${FOLLOWUP_TRAILER}: [0-9a-f]+$`, 'm').test(
      git(root, ['show', '-s', '--format=%B', source]),
    )
  ) {
    return undefined
  }
  let ref: string
  try {
    ref = branch(root)
  } catch {
    return undefined
  }
  const directory = gitPath(root, `quality-followup/${source}`)
  mkdirSync(path.dirname(directory), { recursive: true })
  try {
    mkdirSync(directory)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
      return undefined
    }
    throw error
  }
  const job = { root, source, ref, directory }
  writeFileSync(path.join(directory, 'job.json'), JSON.stringify(job))
  saveOutcome(job, { state: 'queued' })
  return job
}

export async function runJob(job: Job, quality: QualityTask) {
  const suffix = createHash('sha256')
    .update(job.ref + job.root)
    .digest('hex')
    .slice(0, 8)
  const helper = `automation/quality-${job.source.slice(0, 12)}-${suffix}`
  const worktree = path.join(
    mkdtempSync(path.join(os.tmpdir(), 'commit-followup-')),
    'checkout',
  )
  saveOutcome(job, {
    state: 'running',
    pid: process.pid,
    branch: helper,
    worktree,
  })
  try {
    git(job.root, ['worktree', 'add', '-b', helper, worktree, job.source])
    const files = changedFiles(worktree, job.source)
    const generated = await quality(worktree, files, job.root)
    const allowed = [...new Set([...files, ...generated])]
    assertAllowedChanges(worktree, allowed)
    const changed = git(worktree, ['status', '--porcelain=v1']).trim()
    if (!changed) {
      saveOutcome(job, { state: 'unchanged' })
      git(job.root, ['worktree', 'remove', worktree])
      rmdirSync(path.dirname(worktree))
      git(job.root, ['branch', '-d', helper])
      return
    }
    const updates = git(worktree, [
      'status',
      '--porcelain=v1',
      '-z',
      '--untracked-files=all',
    ])
      .split('\0')
      .filter(Boolean)
      .map(entry => entry.slice(3))
    git(worktree, ['--literal-pathspecs', 'add', '-A', '--', ...updates])
    git(worktree, [
      'commit',
      '-m',
      `chore: apply commit follow-up fixes\n\n${FOLLOWUP_TRAILER}: ${job.source}`,
    ])
    const commit = git(worktree, ['rev-parse', 'HEAD']).trim()
    saveOutcome(job, { state: 'ready', branch: helper, worktree, commit })
    if (canApply(job.root, job.source, job.ref)) {
      git(job.root, ['merge', '--ff-only', '--no-edit', commit])
      saveOutcome(job, { state: 'applied', branch: helper, commit })
      git(job.root, ['worktree', 'remove', worktree])
      rmdirSync(path.dirname(worktree))
    }
  } catch (error) {
    const previous = JSON.parse(
      readFileSync(path.join(job.directory, 'status.json'), 'utf8'),
    ) as Outcome
    saveOutcome(job, {
      ...previous,
      state: previous.state === 'ready' ? 'ready' : 'failed',
      branch: helper,
      worktree,
      message: error instanceof Error ? error.message : String(error),
    })
    throw error
  }
}

export function readJob(directory: string): Job {
  return JSON.parse(
    readFileSync(path.join(directory, 'job.json'), 'utf8'),
  ) as Job
}

export function outcomes(root: string): Outcome[] {
  const directory = gitPath(root, 'quality-followup')
  if (!existsSync(directory)) {
    return []
  }
  return readdirSync(directory).flatMap(name => {
    const file = path.join(directory, name, 'status.json')
    return existsSync(file)
      ? [JSON.parse(readFileSync(file, 'utf8')) as Outcome]
      : []
  })
}

export function currentOutcome(root: string) {
  let commit = git(root, ['rev-parse', 'HEAD']).trim()
  const trailer = git(root, ['show', '-s', '--format=%B', commit]).match(
    /^Quality-Followup-For: ([0-9a-f]+)$/m,
  )
  commit = trailer?.[1] ?? commit
  const file = gitPath(root, `quality-followup/${commit}/status.json`)
  return existsSync(file)
    ? (JSON.parse(readFileSync(file, 'utf8')) as Outcome)
    : undefined
}
