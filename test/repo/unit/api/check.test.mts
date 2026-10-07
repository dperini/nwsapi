import { expect, test, vi } from 'vitest'
const state = vi.hoisted(() => ({ main: false, run: vi.fn() }))
vi.mock('../../../../scripts/repo/lib/run-node.mts', () => ({
  isMainModule: () => state.main,
  runNode: state.run,
}))
test('importing the API checker does not start generation', async () => {
  await import('../../../../scripts/repo/api/check.mts')
  expect(state.run).not.toHaveBeenCalled()
})
test.each([false, true])(
  'API checker help=%s delegates only when requested',
  async help => {
    const args = process.argv
    process.argv = [args[0]!, '/api/check.mts', ...(help ? ['--help'] : [])]
    state.main = true
    state.run.mockClear()
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.resetModules()
    try {
      await import('../../../../scripts/repo/api/check.mts')
      expect(state.run).toHaveBeenCalledTimes(help ? 0 : 1)
      if (!help) {
        expect(state.run).toHaveBeenCalledWith(
          expect.stringContaining('/gen/api/markdown.mts'),
          ['--check'],
        )
      }
      expect(log).toHaveBeenCalledTimes(help ? 1 : 0)
    } finally {
      state.main = false
      process.argv = args
    }
  },
)
