import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { test } from 'node:test'
import path from 'node:path'
import { parseOptions, runTask } from '../../../scripts/develop/protocol.mts'
import { TASKS } from '../../../scripts/develop/actions.mts'
import {
  doctorReport,
  main as runDoctor,
} from '../../../scripts/develop/doctor.mts'
import { taskResult } from '../../../scripts/develop/execute.mts'
import { runReview } from '../../../scripts/develop/review.mts'
import { createMenuContext } from '../../../scripts/develop/run.mts'
import { writeDeveloperState } from '../../../scripts/develop/state.mts'

test('developer task IDs are ordered for setup, docs, review, and diagnosis', () => {
  assert.deepEqual(
    TASKS.map(task => task.script),
    ['setup', 'docs', 'review', 'setup:check'],
  )
  assert.equal(TASKS[3].optional, true)
})

test('menu flags parse and conflicting modes fail with actionable errors', () => {
  assert.equal(parseOptions(['--plain']).plain, true)
  assert.equal(parseOptions(['--task', 'review', '--json']).task, 'review')
  assert.throws(() => parseOptions(['--plain', '--json']), /cannot be combined/)
  assert.throws(() => parseOptions(['--task', 'missing']), /Unknown task/)
})

test('JSON discovery is one parseable object with npm execution commands', () => {
  const result = spawnSync(
    process.execPath,
    ['scripts/develop/run.mts', '--list', '--json'],
    {
      encoding: 'utf8',
    },
  )
  assert.equal(result.status, 0, result.stderr)
  const output = JSON.parse(result.stdout)
  assert.equal(output.schemaVersion, 1)
  assert.equal(output.type, 'tasks')
  assert.deepEqual(
    output.tasks.map(task => task.id),
    ['setup', 'docs', 'review', 'setup:check'],
  )
  assert.ok(output.tasks.every(task => task.command[0] === 'npm'))
})

test('JSON task execution keeps progress off stdout and returns a result object', () => {
  const result = spawnSync(
    process.execPath,
    ['scripts/develop/run.mts', '--task', 'docs', '--json'],
    { encoding: 'utf8' },
  )
  assert.equal(result.status, 0, result.stderr)
  const output = JSON.parse(result.stdout)
  assert.equal(output.type, 'result')
  assert.equal(output.task, 'docs')
  assert.equal(output.status, 'completed')
  assert.match(result.stderr, /first-change\.md/)
})

test('invalid JSON task requests return one error object and a nonzero exit', () => {
  const result = spawnSync(
    process.execPath,
    ['scripts/develop/run.mts', '--task', 'missing', '--json'],
    { encoding: 'utf8' },
  )
  assert.equal(result.status, 1)
  const output = JSON.parse(result.stdout)
  assert.equal(output.type, 'error')
  assert.equal(output.status, 'failed')
})

test('restores the prior selection as historical metadata without launching it', t => {
  const root = mkdtempSync(path.join(tmpdir(), 'nwsapi-menu-history-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  mkdirSync(path.join(root, '.cache'))
  const identity = { checkout: realpathSync(root), revision: 'current123' }
  writeDeveloperState(
    root,
    { ...identity, revision: 'prior456' },
    {
      taskId: 'review',
      status: 'failed',
      exitCode: 1,
      signal: null,
      updatedAt: new Date().toISOString(),
    },
  )

  const { state } = createMenuContext(root, identity)

  assert.equal(state.selected, 2)
  assert.match(state.result, /Historical result/)
  assert.match(state.result, /older revision prior456/)
  assert.match(state.result, /Review my changes was failed/)
  assert.match(state.result, /does not validate the current checkout/)
})

test('review reports npm test progress and elapsed time', async () => {
  const events = []
  let clock = 100
  const result = await runReview(
    async () => {
      events.push('test')
      return { code: 0, signal: null }
    },
    () => {
      clock += 42
      return clock
    },
    message => events.push(message),
  )

  assert.deepEqual(events, [
    '[review] Starting npm test.',
    'test',
    '[review] npm test finished in 42ms with exit code 0.',
  ])
  assert.deepEqual(result, { code: 0, signal: null })
})

test('review reports a failed npm test without changing its exit result', async () => {
  const events = []
  const result = await runReview(
    async () => ({ code: 1, signal: null }),
    (() => {
      let clock = 0
      return () => (clock += 9)
    })(),
    message => events.push(message),
  )

  assert.equal(events.length, 2)
  assert.match(events[1], /finished in 9ms with exit code 1/)
  assert.deepEqual(result, { code: 1, signal: null })
})

test('unready setup diagnostics produce a failed JSON task result without writes', () => {
  const missingRoot = path.join(
    tmpdir(),
    `nwsapi-doctor-${process.pid}-missing`,
  )
  const log = () => {}
  const options = {
    repoRoot: missingRoot,
    toolBin: path.join(missingRoot, '.cache', 'bin'),
    statePath: path.join(missingRoot, '.cache', 'bin', 'toolchain.json'),
    log,
    env: { PATH: '' },
  }
  const report = doctorReport(options)
  assert.equal(report.ready, false)
  assert.equal(runDoctor([], options), 1)
  const output = []
  const originalLog = console.log
  const originalExitCode = process.exitCode
  console.log = value => output.push(value)
  return runTask('setup:check', true, async task =>
    taskResult(task, report.ready ? 0 : 1, null),
  )
    .then(() => {
      assert.equal(process.exitCode, 1)
      const result = JSON.parse(output[0])
      assert.equal(typeof result.message, 'string')
      delete result.message
      assert.deepEqual(result, {
        schemaVersion: 1,
        type: 'result',
        task: 'setup:check',
        status: 'failed',
        exitCode: 1,
        signal: null,
        next: null,
      })
      assert.equal(existsSync(missingRoot), false)
    })
    .finally(() => {
      console.log = originalLog
      process.exitCode = originalExitCode
    })
})
