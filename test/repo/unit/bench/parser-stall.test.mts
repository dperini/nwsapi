import assert from 'node:assert/strict'
import { test, vi } from 'vitest'
import { invokeMainModule } from './main-module.mts'

const state = vi.hoisted(() => ({
  spawn: vi.fn(),
  read: vi.fn(),
  write: vi.fn(),
}))
vi.mock('node:child_process', () => ({ spawnSync: state.spawn }))
vi.mock('node:fs', () => ({
  readFileSync: state.read,
  writeFileSync: state.write,
}))
vi.mock('../../../../scripts/repo/bench/footprint/shared.mts', () => ({
  provenance: () => ({ node: 'fixture' }),
}))
import { probeParser } from '../../../../scripts/repo/bench/parser-stall.mts'

test('parser probe transmits selectors through stdin and preserves coded process failures', () => {
  state.spawn.mockReturnValue({
    status: 0,
    stdout: JSON.stringify({ outcome: 'SyntaxError', selectMs: 1 }),
  })
  assert.deepEqual(probeParser(':bad', 123), {
    outcome: 'SyntaxError',
    selectMs: 1,
  })
  assert.equal(state.spawn.mock.calls[0]![2].input, ':bad')
  assert.equal(state.spawn.mock.calls[0]![2].timeout, 123)
  const failure = Object.assign(new Error('timeout'), { code: 'ETIMEDOUT' })
  state.spawn.mockReturnValue({ error: failure })
  assert.throws(() => probeParser(':bad'), { code: 'ETIMEDOUT' })
  state.spawn.mockReturnValue({ status: 1, stderr: 'failed' })
  assert.throws(() => probeParser(':bad'))
  state.spawn.mockReturnValue({ status: 0, stdout: '' })
  assert.throws(() => probeParser(':bad'), SyntaxError)
})

test('parser report verifies rejection before persisting the fresh measurements', async () => {
  state.read.mockReturnValue(
    JSON.stringify({ input: { data: Buffer.from(':bad').toString('base64') } }),
  )
  state.spawn.mockReturnValue({
    status: 0,
    stdout: JSON.stringify({ outcome: 'SyntaxError', selectMs: 1.25 }),
  })
  vi.spyOn(console, 'log').mockImplementation(() => {})
  const load = () => import('../../../../scripts/repo/bench/parser-stall.mts')
  const subject = '/bench/parser-stall.mts'
  await invokeMainModule(load, [], subject)
  const report = JSON.parse(state.write.mock.calls[0]![1])
  assert.equal(report.verification.timeoutMs, 3000)
  assert.equal(report.verification.selectMs, 1.25)
  assert.equal(report.verification.node, 'fixture')
  assert.equal(report.notes.length, 3)
  state.spawn.mockReturnValue({
    status: 0,
    stdout: JSON.stringify({ outcome: 'accepted', selectMs: 1 }),
  })
  await assert.rejects(invokeMainModule(load, [], subject))
  assert.equal(state.write.mock.calls.length, 1)
})
