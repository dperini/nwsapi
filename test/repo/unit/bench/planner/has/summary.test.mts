import { afterEach, beforeEach, expect, test, vi } from 'vitest'
const state = vi.hoisted(() => ({ write: vi.fn(), read: vi.fn() }))
vi.mock('node:fs', () => ({
  readFileSync: state.read,
  writeFileSync: state.write,
}))
vi.mock('../../../../../../scripts/repo/bench/footprint/shared.mts', () => ({
  sha256: () => 'hash',
}))
const argv = process.argv.slice()
beforeEach(() => {
  vi.resetModules()
  state.write.mockClear()
  state.read.mockReset().mockImplementation((file: string) =>
    file.endsWith('.json')
      ? JSON.stringify({
          rows: [
            { split: 'train', costs: [4, 2] },
            { split: 'holdout', costs: [6, 3] },
          ],
        })
      : Buffer.from('engine'),
  )
  process.argv = [
    argv[0]!,
    'summary.mts',
    '/fixture/results',
    '/fixture/baseline',
  ]
})
afterEach(() => {
  process.argv = argv
})
test('derives per-host phase holdout and cold summaries from frozen measurements', async () => {
  await import('../../../../../../scripts/repo/bench/planner/has/summary.mts')
  const result = JSON.parse(state.write.mock.calls[0]![1])
  expect(result.chromium.preflight).toEqual({
    cases: 2,
    speedup: 2,
    worst: 0.5,
    holdoutSpeedup: 2,
  })
  expect(result.jsdom['confirmation-repeat']).toEqual(result.chromium.preflight)
  expect(result.cold).toEqual({ speedup: 2, worst: 0.5 })
  expect(result.footprint).toHaveLength(2)
  expect(result.footprint[0].bytes).toBe(6)
})
test.each([[], ['/fixture/results']])(
  'requires both report directory and baseline %j',
  async (...args) => {
    process.argv = [argv[0]!, 'summary.mts', ...args]
    await expect(
      import('../../../../../../scripts/repo/bench/planner/has/summary.mts'),
    ).rejects.toBeInstanceOf(Error)
  },
)
