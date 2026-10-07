import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import type * as Fs from 'node:fs'
import { test, vi } from 'vitest'
import type * as Shared from '../../../../../scripts/repo/bench/footprint/shared.mts'
const state = vi.hoisted(() => ({
  exec: vi.fn(),
  write: vi.fn(),
  mkdir: vi.fn(),
}))
vi.mock('node:child_process', () => ({ execFileSync: state.exec }))
vi.mock('node:fs', async importOriginal => {
  const actual = await importOriginal<typeof Fs>()
  return { ...actual, writeFileSync: state.write, mkdirSync: state.mkdir }
})
vi.mock(
  '../../../../../scripts/repo/bench/footprint/shared.mts',
  async importOriginal => {
    const actual = await importOriginal<typeof Shared>()
    return { ...actual, provenance: () => ({ fixture: true }) }
  },
)

test('footprint orchestrator rotates real worker entrypoints and summarizes fresh process samples', async () => {
  const original = process.argv
  vi.spyOn(console, 'log').mockImplementation(() => {})
  state.exec.mockImplementation((_command: string, args: string[]) =>
    JSON.stringify({
      initialized: args[2] === 'nwsapi' ? 1024 : 2048,
      queried: 4096,
      cacheGrowth: 3072,
      fixtureSha256: 'fixture',
    }),
  )
  const load = async (args: string[]) => {
    vi.resetModules()
    process.argv = [original[0]!, 'run.mts', ...args]
    await import('../../../../../scripts/repo/bench/footprint/run.mts')
  }
  try {
    await load([
      '--count',
      '2',
      '--queries',
      '3',
      '--rounds',
      '2',
      '--output',
      '/fixture/report.json',
    ])
    assert.deepEqual(
      state.exec.mock.calls.map(call => call[1][2]),
      ['nwsapi', 'dom-selector', 'dom-selector', 'nwsapi'],
    )
    assert.equal(existsSync(state.exec.mock.calls[0]![1][1]), true)
    assert.deepEqual(state.exec.mock.calls[0]![1].slice(-2), ['2', '3'])
    const report = JSON.parse(state.write.mock.calls[0]![1])
    assert.equal(report.metadata.fixtureSha256, 'fixture')
    assert.equal(report.rows[0].initialized.median, 1024)
    assert.equal(report.rows[1].initialized.median, 2048)
    assert.deepEqual(report.rows[0].cacheGrowth.samples, [3072, 3072])
    await load(['--help'])
    assert.equal(state.exec.mock.calls.length, 4)
    await load([])
    assert.deepEqual(state.exec.mock.calls.at(-1)![1].slice(-2), ['40', '100'])
    await assert.rejects(load(['--count', '0']), RangeError)
    const failure = Object.assign(new Error('child'), { code: 'CHILD_FAILED' })
    state.exec.mockImplementationOnce(() => {
      throw failure
    })
    await assert.rejects(load(['--rounds', '1']), { code: 'CHILD_FAILED' })
  } finally {
    process.argv = original
    vi.resetModules()
  }
})
