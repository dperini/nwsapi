import { afterEach, expect, test, vi } from 'vitest'
import path from 'node:path'
import { TOOL_BIN } from '../../../../../scripts/repo/external-tools.mts'
import {
  configureHookEnvironment,
  parseChangedPaths,
  parsePushRefs,
  runPrePush,
  type PushHookDependencies,
} from '../../../../../scripts/repo/git/hooks/run.mts'

function pushHarness(
  responses: Record<string, { status: number; stdout: string }>,
) {
  const gitCalls: string[][] = []
  const plans: unknown[] = []
  const messages: string[] = []
  const events: string[] = []
  const runChecks = vi.fn(() => {
    events.push('checks')
  })
  const runNodePlan = vi.fn(async (plan: unknown) => {
    events.push('node')
    plans.push(plan)
  })
  const dependencies: PushHookDependencies = {
    runGit(args) {
      gitCalls.push(args)
      const key =
        args[1] === '--verify'
          ? 'verify'
          : args[0] === 'diff'
            ? 'diff'
            : (args[0] ?? '')
      const response = responses[key]
      if (response) {
        return response
      }
      if (args[1] === '--verify') {
        return { status: 0, stdout: `${args[2]?.split('^')[0]}\n` }
      }
      return {
        status: 0,
        stdout: '',
      }
    },
    runChecks,
    runNodePlan: runNodePlan as PushHookDependencies['runNodePlan'],
    log: message => messages.push(message),
    error: message => messages.push(message),
  }
  return {
    dependencies,
    gitCalls,
    plans,
    messages,
    events,
    runChecks,
    runNodePlan,
  }
}

const update = (remoteSha = 'base') =>
  `refs/heads/topic head refs/heads/topic ${remoteSha}\n`

afterEach(() => {
  process.exitCode = undefined
})

test('parses advertised ref updates and rejects malformed input', () => {
  expect(parsePushRefs(update())).toEqual([
    {
      localRef: 'refs/heads/topic',
      localSha: 'head',
      remoteRef: 'refs/heads/topic',
      remoteSha: 'base',
    },
  ])
  expect(parsePushRefs('')).toEqual([])
  expect(() => parsePushRefs('malformed')).toThrow(
    'Invalid pre-push ref update',
  )
})

test('parses NUL-delimited Unicode, deletion, and rename paths', () => {
  expect(
    parseChangedPaths(
      'M\0src/Δ.mts\0D\0test/repo/unit/old.test.mts\0R100\0old.mts\0new.mts\0',
    ),
  ).toEqual({
    files: ['src/Δ.mts', 'test/repo/unit/old.test.mts', 'old.mts', 'new.mts'],
    deleted: ['test/repo/unit/old.test.mts', 'old.mts'],
  })
})

test('skips deletion-only pushes without running checks', async () => {
  const harness = pushHarness({})
  const code = await runPrePush(
    `refs/heads/topic ${'0'.repeat(40)} refs/heads/topic old\n`,
    harness.dependencies,
  )
  expect(code).toBe(0)
  expect(harness.plans).toHaveLength(0)
  expect(harness.runChecks).not.toHaveBeenCalled()
})

test('requires exact current HEAD and a clean checkout before testing', async () => {
  const mismatch = pushHarness({
    'rev-parse': { status: 0, stdout: 'head\n' },
    verify: { status: 0, stdout: 'different\n' },
  })
  expect(await runPrePush(update(), mismatch.dependencies)).toBe(1)
  expect(mismatch.plans).toHaveLength(0)
  expect(mismatch.runChecks).not.toHaveBeenCalled()

  const dirty = pushHarness({
    'rev-parse': { status: 0, stdout: 'head\n' },
    status: { status: 0, stdout: ' M src/core/select.mts\n' },
  })
  expect(await runPrePush(update(), dirty.dependencies)).toBe(1)
  expect(dirty.messages.join('\n')).toContain('clean checkout')
  expect(dirty.runChecks).not.toHaveBeenCalled()
})

test('runs main repository checks before the CI test plan for docs-only changes', async () => {
  const harness = pushHarness({
    'rev-parse': { status: 0, stdout: 'head\n' },
    status: { status: 0, stdout: '' },
    'merge-base': { status: 0, stdout: 'merge\n' },
    diff: { status: 0, stdout: 'M\0docs/repo/topic.md\0' },
  })
  expect(await runPrePush(update(), harness.dependencies)).toBe(0)
  expect(harness.events).toEqual(['checks', 'node'])
  expect(harness.runChecks).toHaveBeenCalledOnce()
  expect(harness.plans[0]).toMatchObject({
    browser: false,
    fullNode: false,
    node: false,
    testFiles: [],
  })
})

test('isolates the CI plan from Git hook context and restores it afterward', async () => {
  const harness = pushHarness({
    'rev-parse': { status: 0, stdout: 'head\n' },
    status: { status: 0, stdout: '' },
    'merge-base': { status: 0, stdout: 'merge\n' },
    diff: { status: 0, stdout: 'M\0docs/repo/topic.md\0' },
  })
  const previousDirectory = process.env['GIT_DIR']
  const previousWorkTree = process.env['GIT_WORK_TREE']
  process.env['GIT_DIR'] = '/hook/repository.git'
  process.env['GIT_WORK_TREE'] = '/hook/worktree'
  let observedDirectory: string | undefined
  let observedWorkTree: string | undefined
  harness.runNodePlan.mockImplementation(async () => {
    observedDirectory = process.env['GIT_DIR']
    observedWorkTree = process.env['GIT_WORK_TREE']
  })
  try {
    expect(await runPrePush(update(), harness.dependencies)).toBe(0)
    expect(observedDirectory).toBeUndefined()
    expect(observedWorkTree).toBeUndefined()
    expect(process.env['GIT_DIR']).toBe('/hook/repository.git')
    expect(process.env['GIT_WORK_TREE']).toBe('/hook/worktree')
  } finally {
    if (previousDirectory === undefined) {
      delete process.env['GIT_DIR']
    } else {
      process.env['GIT_DIR'] = previousDirectory
    }
    if (previousWorkTree === undefined) {
      delete process.env['GIT_WORK_TREE']
    } else {
      process.env['GIT_WORK_TREE'] = previousWorkTree
    }
  }
})

test('a failed main check stops the push and reports a concise error', async () => {
  const harness = pushHarness({
    'rev-parse': { status: 0, stdout: 'head\n' },
    status: { status: 0, stdout: '' },
    'merge-base': { status: 0, stdout: 'merge\n' },
    diff: { status: 0, stdout: 'M\0docs/repo/topic.md\0' },
  })
  harness.runChecks.mockImplementation(() => {
    throw new Error('generated metadata is stale')
  })
  expect(await runPrePush(update(), harness.dependencies)).toBe(1)
  expect(harness.plans).toHaveLength(0)
  expect(harness.messages.join('\n')).toContain(
    '[hooks] Main repository checks failed: generated metadata is stale',
  )
})

test('rechecks the checkout after main checks and after the CI test plan', async () => {
  const changedByCheck = {
    'rev-parse': { status: 0, stdout: 'head\n' },
    status: { status: 0, stdout: '' },
    'merge-base': { status: 0, stdout: 'merge\n' },
    diff: { status: 0, stdout: 'M\0docs/repo/topic.md\0' },
  }
  const first = pushHarness(changedByCheck)
  first.runChecks.mockImplementation(() => {
    changedByCheck.status = { status: 0, stdout: ' M src/core/select.mts\n' }
  })
  expect(await runPrePush(update(), first.dependencies)).toBe(1)
  expect(first.plans).toHaveLength(0)

  const changedByNode = {
    'rev-parse': { status: 0, stdout: 'head\n' },
    status: { status: 0, stdout: '' },
    'merge-base': { status: 0, stdout: 'merge\n' },
    diff: { status: 0, stdout: 'M\0docs/repo/topic.md\0' },
  }
  const second = pushHarness(changedByNode)
  second.runNodePlan.mockImplementation(async () => {
    changedByNode.status = { status: 0, stdout: ' M src/core/select.mts\n' }
  })
  expect(await runPrePush(update(), second.dependencies)).toBe(1)
  expect(second.messages.join('\n')).toContain('clean checkout')
})

test('uses the full Node plan for new branches or missing remote bases', async () => {
  const fresh = pushHarness({
    'rev-parse': { status: 0, stdout: 'head\n' },
    status: { status: 0, stdout: '' },
  })
  await runPrePush(update('0'.repeat(40)), fresh.dependencies)
  expect(fresh.plans[0]).toMatchObject({ fullNode: true, node: true })

  const missing = pushHarness({
    'rev-parse': { status: 0, stdout: 'head\n' },
    status: { status: 0, stdout: '' },
    'merge-base': { status: 1, stdout: '' },
  })
  await runPrePush(update(), missing.dependencies)
  expect(missing.plans[0]).toMatchObject({ fullNode: true, node: true })
})

test('plans CI Node checks from remote-base changes including deleted paths', async () => {
  const harness = pushHarness({
    'rev-parse': { status: 0, stdout: 'head\n' },
    status: { status: 0, stdout: '' },
    'merge-base': { status: 0, stdout: 'merge\n' },
    diff: {
      status: 0,
      stdout: 'M\0src/Δ.mts\0D\0test/repo/unit/old.test.mts\0',
    },
  })
  await runPrePush(update(), harness.dependencies)
  expect(harness.gitCalls).toContainEqual([
    'diff',
    '--name-status',
    '--diff-filter=ACMRD',
    '-z',
    'merge...head',
  ])
  expect(harness.plans[0]).toMatchObject({ fullNode: true, node: true })
})

test('runs a full plan when a pushed change deletes a test suite', async () => {
  const harness = pushHarness({
    'rev-parse': { status: 0, stdout: 'head\n' },
    status: { status: 0, stdout: '' },
    'merge-base': { status: 0, stdout: 'merge\n' },
    diff: {
      status: 0,
      stdout: 'D\0test/repo/unit/removed.test.mts\0',
    },
  })
  await runPrePush(update(), harness.dependencies)
  expect(harness.plans[0]).toMatchObject({ fullNode: true, node: true })
})

test('hook children use managed launchers and preserve unrelated environment', () => {
  const env: NodeJS.ProcessEnv = {
    PATH: '/user/tools',
    CUSTOM_SETTING: 'keep',
    npm_execpath: '/unrelated/npm',
    npm_lifecycle_event: 'push',
  }
  const result = configureHookEnvironment(env)
  expect(result).toBe(env)
  expect(result['PATH']).toBe([TOOL_BIN, '/user/tools'].join(path.delimiter))
  expect(result['CUSTOM_SETTING']).toBe('keep')
  expect(result['npm_execpath']).toBeUndefined()
  expect(result['npm_lifecycle_event']).toBeUndefined()
  expect(result['SFW_UNKNOWN_HOST_ACTION']).toBe('ignore')
})
