import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import type * as Fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { test, vi } from 'vitest'
import {
  ENGINE_BUILD_PATH,
  REPO_ROOT,
} from '../../../../../../scripts/repo/lib/paths.mts'
const state = vi.hoisted(() => ({
  exec: vi.fn(() => 'historical'),
  spawn: vi.fn(),
  read: vi.fn((_file: unknown, _encoding: string) => 'current'),
  write: vi.fn(),
}))
vi.mock('node:child_process', () => ({
  execFileSync: state.exec,
  spawnSync: state.spawn,
}))
vi.mock('node:fs', async importOriginal => {
  const actual = await importOriginal<typeof Fs>()
  return { ...actual, readFileSync: state.read, writeFileSync: state.write }
})

test('reentry runner uses current build paths and distinguishes deadlines from process failures', async () => {
  vi.spyOn(console, 'log').mockImplementation(() => {})
  state.spawn.mockImplementation(
    (_command: string, args: string[], options: { input: string }) => {
      assert.equal(existsSync(args[0]!), true)
      const input = JSON.parse(options.input)
      return input.limit
        ? { status: 0, stdout: JSON.stringify({ calls: input.limit }) }
        : { error: Object.assign(new Error('timeout'), { code: 'ETIMEDOUT' }) }
    },
  )
  const load = async () => {
    vi.resetModules()
    await import('../../../../../../scripts/repo/bench/display-state/reentry/run.mts')
  }
  await load()
  assert.equal(state.read.mock.calls[0]![0], ENGINE_BUILD_PATH)
  assert.equal(
    fileURLToPath(state.write.mock.calls[0]![0]),
    path.join(REPO_ROOT, 'assets/repo/bench/display-state-reentry.json'),
  )
  const report = JSON.parse(state.write.mock.calls[0]![1])
  assert.equal(report.rows.length, 12)
  assert.equal(
    report.rows.filter((row: { timedOut: boolean }) => row.timedOut).length,
    3,
  )
  assert.equal(report.rows[3].limit, null)
  assert.equal(report.rows[3].result, null)
  assert.equal(report.engineHash.length, 64)
  state.spawn.mockReturnValue({
    error: Object.assign(new Error('spawn'), { code: 'SPAWN_FAILED' }),
  })
  await assert.rejects(load(), { code: 'SPAWN_FAILED' })
  state.spawn.mockReturnValue({ error: new Error('spawn') })
  await assert.rejects(load())
  state.spawn.mockReturnValue({ status: 1, stderr: 'failed' })
  await assert.rejects(load())
  state.spawn.mockReturnValue({ status: 0, stdout: '' })
  await assert.rejects(load(), SyntaxError)
  assert.equal(state.write.mock.calls.length, 1)
})
