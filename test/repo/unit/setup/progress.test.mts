import assert from 'node:assert/strict'
import { test } from 'node:test'
import { setupPhase } from '../../../../scripts/setup/progress.mts'
import type { SetupProgress } from '../../../../scripts/setup/progress.mts'

test('setup progress reports completion without using saved progress to skip work', async () => {
  const states: SetupProgress[] = []
  let calls = 0
  for (let index = 0; index < 2; index += 1) {
    const result = await setupPhase(
      'tools',
      () => {
        calls += 1
        return { status: 0 }
      },
      () => {},
      value => states.push(value),
    )
    assert.equal(result.status, 0)
  }
  assert.equal(calls, 2)
  assert.deepEqual(
    states.map(value => value.status),
    ['running', 'completed', 'running', 'completed'],
  )
})

test('setup failures retain the original error and show a retry', async () => {
  const states: SetupProgress[] = []
  const logs: string[] = []
  const error = Object.assign(new Error('download failed'), {
    code: 'ECONNRESET',
  })
  await assert.rejects(
    setupPhase(
      'tools',
      () => {
        throw error
      },
      value => logs.push(value),
      value => states.push(value),
    ),
    error,
  )
  assert.equal(states[1]?.status, 'failed')
  assert.equal(states[1]?.message, 'download failed')
  assert.ok(logs.some(value => value.includes('node scripts/setup.mjs')))
})

test('nonzero and signalled subprocess outcomes are recorded as failed', async () => {
  for (const outcome of [{ status: 1 }, { status: null, signal: 'SIGINT' }]) {
    const states: SetupProgress[] = []
    assert.equal(
      await setupPhase(
        'install',
        () => outcome,
        () => {},
        value => states.push(value),
      ),
      outcome,
    )
    assert.equal(states[1]?.status, 'failed')
  }
})

test('optional setup failures preserve the requested retry option', async () => {
  const logs: string[] = []
  await setupPhase(
    'browser fixtures',
    () => ({ status: 1 }),
    value => logs.push(value),
    () => {},
    'node scripts/setup.mjs --full',
  )
  assert.ok(logs.some(value => value.includes('node scripts/setup.mjs --full')))
})
