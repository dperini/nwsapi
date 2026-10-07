import assert from 'node:assert/strict'
import path from 'node:path'
import { afterEach, test, vi } from 'vitest'

const state = vi.hoisted(() => ({
  read: vi.fn(() => Buffer.from('model')),
  write: vi.fn(),
  mkdir: vi.fn(),
  calls: (features: number[]) => features[0]! >= 32,
  clock: 0,
}))
vi.mock('node:fs', () => ({
  readFileSync: state.read,
  writeFileSync: state.write,
  mkdirSync: state.mkdir,
}))
vi.mock('node:perf_hooks', () => ({
  performance: {
    now: () => {
      state.clock += 1
      return state.clock
    },
  },
}))
afterEach(() => vi.clearAllMocks())

test('standalone inference runner records route-only overhead for domain and fallback cases', async () => {
  const originalArgs = process.argv
  vi.spyOn(console, 'log').mockImplementation(() => {})
  const paths = [
    '/fixture/inference',
    path.resolve('assets/repo/bench/planner-neural-2026-10-04'),
  ]
  try {
    for (let index = 0, length = paths.length; index < length; index += 1) {
      const directory = paths[index]!
      const file = path.resolve(directory, 'model.mjs')
      vi.doMock(file, () => ({ chooseInverse: state.calls }))
      vi.resetModules()
      process.argv = index
        ? [originalArgs[0]!, 'inference.mts']
        : [originalArgs[0]!, 'inference.mts', directory]
      const { production } =
        await import('../../../../../../scripts/repo/bench/planner/neural/inference.mts')
      assert.equal(production([32, 768, 3, 4]), true)
      assert.equal(production([32, 768, 2, 4]), false)
      assert.equal(production([193, 768, 0, 4]), false)
      assert.equal(production([32, -1, 0, 4]), true)
      assert.equal(production([32, 769, 0, 4]), false)
      assert.equal(production([32, 768, 0, -1]), false)
      assert.equal(production([32, 768, 0, 5]), false)
      const report = JSON.parse(state.write.mock.calls.at(-1)![1])
      assert.equal(report.rounds, 9)
      assert.equal(report.callsPerRound, 100_000)
      assert.equal(report.modelBytes, 5)
      assert.equal(report.results['in-domain'].model.checksum, 910_000)
      assert.equal(report.results['fallback-small'].model.checksum, 0)
      assert.ok(report.results['in-domain'].model.medianNsPerCall > 0)
      assert.equal(report.results['fallback-small'].rule.checksum, 0)
      vi.doUnmock(file)
    }
  } finally {
    process.argv = originalArgs
    vi.resetModules()
  }
})
