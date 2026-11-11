import { afterEach, expect, test } from 'vitest'
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  git,
  changedFiles,
} from '../../../../../scripts/repo/git/followup/git.mts'
import {
  queueJob,
  runJob,
  currentOutcome,
} from '../../../../../scripts/repo/git/followup/worker.mts'
import type { Job } from '../../../../../scripts/repo/git/followup/worker.mts'

const roots: string[] = []
const jobs: Job[] = []

export function fixture() {
  const root = mkdtempSync(path.join(os.tmpdir(), 'followup-test-'))
  roots.push(root)
  git(root, ['init', '-b', 'main'])
  git(root, ['config', 'user.email', 'test@example.invalid'])
  git(root, ['config', 'user.name', 'Test'])
  git(root, ['config', 'commit.gpgsign', 'false'])
  writeFileSync(path.join(root, 'changed.txt'), 'old\n')
  writeFileSync(path.join(root, 'other.txt'), 'unrelated\n')
  writeFileSync(path.join(root, '.gitignore'), '.cache/\nnode_modules/\n')
  git(root, ['add', '.'])
  git(root, ['commit', '-m', 'initial'])
  writeFileSync(path.join(root, 'changed.txt'), 'committed\n')
  git(root, ['add', 'changed.txt'])
  git(root, ['commit', '-m', 'source'])
  const job = queueJob(root)!
  jobs.push(job)
  return job
}

export function outcome(job: Job) {
  return JSON.parse(
    readFileSync(path.join(job.directory, 'status.json'), 'utf8'),
  )
}

afterEach(() => {
  for (const job of jobs.splice(0)) {
    const state = outcome(job)
    if (state.worktree) {
      rmSync(path.dirname(state.worktree), { recursive: true, force: true })
    }
  }
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true })
  }
})

test('commits only the committed scope and fast-forwards once without a loop', async () => {
  const job = fixture()
  expect(queueJob(job.root)).toBeUndefined()
  await runJob(job, async (root, files) => {
    expect(files).toEqual(['changed.txt'])
    expect(readFileSync(path.join(root, 'changed.txt'), 'utf8')).toBe(
      'committed\n',
    )
    writeFileSync(path.join(root, 'changed.txt'), 'formatted\n')
    return []
  })
  expect(outcome(job).state).toBe('applied')
  expect(readFileSync(path.join(job.root, 'changed.txt'), 'utf8')).toBe(
    'formatted\n',
  )
  expect(git(job.root, ['rev-parse', 'HEAD^']).trim()).toBe(job.source)
  expect(changedFiles(job.root, 'HEAD')).toEqual(['changed.txt'])
  expect(queueJob(job.root)).toBeUndefined()
  expect(currentOutcome(job.root)?.state).toBe('applied')
})

test('partial staging and later edits stay untouched while a follow-up is retained', async () => {
  const job = fixture()
  writeFileSync(path.join(job.root, 'changed.txt'), 'unstaged continuation\n')
  writeFileSync(path.join(job.root, 'other.txt'), 'next staged edit\n')
  git(job.root, ['add', 'other.txt'])
  const index = git(job.root, ['write-tree'])
  await runJob(job, async root => {
    expect(readFileSync(path.join(root, 'changed.txt'), 'utf8')).toBe(
      'committed\n',
    )
    writeFileSync(path.join(root, 'changed.txt'), 'formatted\n')
    return []
  })
  expect(outcome(job).state).toBe('ready')
  expect(git(job.root, ['write-tree'])).toBe(index)
  expect(git(job.root, ['rev-parse', 'HEAD']).trim()).toBe(job.source)
  expect(readFileSync(path.join(job.root, 'changed.txt'), 'utf8')).toBe(
    'unstaged continuation\n',
  )
})

test('a newer commit or branch switch prevents automatic application', async () => {
  for (const mode of ['commit', 'branch']) {
    const job = fixture()
    await runJob(job, async root => {
      writeFileSync(path.join(root, 'changed.txt'), 'formatted\n')
      if (mode === 'commit') {
        git(job.root, ['commit', '--allow-empty', '-m', 'next'])
      } else {
        git(job.root, ['switch', '-c', 'other'])
      }
      return []
    })
    expect(outcome(job).state).toBe('ready')
    expect(readFileSync(path.join(job.root, 'changed.txt'), 'utf8')).toBe(
      'committed\n',
    )
  }
})

test('failed tools and out-of-scope writes never create a follow-up commit', async () => {
  for (const mode of ['failure', 'outside']) {
    const job = fixture()
    await expect(
      runJob(job, async root => {
        writeFileSync(path.join(root, 'other.txt'), 'unexpected\n')
        if (mode === 'failure') {
          throw new Error('Unfixable lint error')
        }
        return []
      }),
    ).rejects.toThrow()
    expect(outcome(job).state).toBe('failed')
    expect(git(job.root, ['rev-parse', 'HEAD']).trim()).toBe(job.source)
    expect(readFileSync(path.join(job.root, 'other.txt'), 'utf8')).toBe(
      'unrelated\n',
    )
  }
})

test('a no-op produces no commit', async () => {
  const job = fixture()
  await runJob(job, async () => [])
  expect(outcome(job).state).toBe('unchanged')
  expect(git(job.root, ['rev-parse', 'HEAD']).trim()).toBe(job.source)
})

test('generated translations are explicitly allowed alongside the scoped source', async () => {
  const job = fixture()
  await runJob(job, async root => {
    mkdirSync(path.join(root, '.cache'))
    writeFileSync(path.join(root, '.cache', 'translations.json'), '{}')
    writeFileSync(path.join(root, 'translated.json'), '{"text":"Ciao"}\n')
    return ['translated.json']
  })
  expect(outcome(job).state).toBe('applied')
  expect(changedFiles(job.root, 'HEAD')).toEqual(['translated.json'])
})
