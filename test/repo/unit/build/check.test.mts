import { expect, test, vi } from 'vitest'
const state = vi.hoisted(() => ({ main: false, check: vi.fn() }))
vi.mock('../../../../scripts/repo/lib/run-node.mts', () => ({
  isMainModule: () => state.main,
}))
vi.mock('../../../../scripts/repo/build/manifest.mts', () => ({
  checkPackageManifest: state.check,
}))
test('importing the checker does not run verification', async () => {
  state.main = false
  state.check.mockClear()
  vi.resetModules()
  await import('../../../../scripts/repo/build/check.mts')
  expect(state.check).not.toHaveBeenCalled()
})
test.each([false, true])(
  'CLI help=%s checks only the requested mode',
  async help => {
    vi.resetModules()
    state.main = true
    state.check.mockClear()
    const args = process.argv
    process.argv = [args[0]!, '/build/check.mts', ...(help ? ['--help'] : [])]
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    try {
      await import('../../../../scripts/repo/build/check.mts')
      expect(state.check).toHaveBeenCalledTimes(help ? 0 : 1)
      expect(log).toHaveBeenCalledTimes(help ? 1 : 0)
    } finally {
      process.argv = args
    }
  },
)
