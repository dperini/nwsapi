import { beforeEach, expect, test, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ generate: vi.fn(), main: true }))
vi.mock('../../../../../scripts/repo/gen/ai/favicon.mts', () => ({
  generateAgentFavicon: mocks.generate,
}))
vi.mock('../../../../../scripts/repo/lib/run-node.mts', () => ({
  isMainModule: () => mocks.main,
}))
beforeEach(() => {
  vi.resetModules()
  vi.clearAllMocks()
  mocks.main = true
})
test.each([
  { main: true, args: [], checks: 1 },
  { main: true, args: ['--help'], checks: 0 },
  { main: false, args: [], checks: 0 },
])('check entrypoint $main $args', async ({ main, args, checks }) => {
  mocks.main = main
  const argv = process.argv
  process.argv = ['node', 'check.mts', ...args]
  vi.spyOn(console, 'log').mockImplementation(() => {})
  try {
    await import('../../../../../scripts/repo/ai/favicon/check.mts')
    expect(mocks.generate).toHaveBeenCalledTimes(checks)
    if (checks) {
      expect(mocks.generate).toHaveBeenCalledWith(true)
    }
  } finally {
    process.argv = argv
  }
})
