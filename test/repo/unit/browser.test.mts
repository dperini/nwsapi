import { beforeEach, expect, test, vi } from 'vitest'
const state = vi.hoisted(() => ({
  main: false,
  exists: true,
  version: '',
  exec: vi.fn(),
  install: vi.fn(async () => ({ executablePath: '/chrome' })),
}))
vi.mock('@puppeteer/browsers', () => ({
  Browser: { CHROME: 'chrome' },
  computeExecutablePath: () => '/chrome',
  install: state.install,
}))
vi.mock('node:child_process', () => ({ execFileSync: state.exec }))
vi.mock('node:fs', async original => ({
  ...(await original<object>()),
  existsSync: () => state.exists,
}))
vi.mock('../../../scripts/repo/lib/run-node.mts', () => ({
  isMainModule: () => state.main,
}))
beforeEach(() => {
  vi.resetModules()
  state.main = false
  state.exists = true
  state.exec.mockReset()
  state.install.mockClear()
})
test('launch options validate and memoize the pinned executable', async () => {
  const module = await import('../../../scripts/repo/browser.mts')
  state.exec.mockReturnValue('Google Chrome ' + module.CHROME_VERSION)
  expect(module.browserLaunchOptions()).toEqual({ executablePath: '/chrome' })
  expect(module.browserLaunchOptions()).toEqual({ executablePath: '/chrome' })
  expect(state.exec).toHaveBeenCalledOnce()
})
test.each([false, true])(
  'missing or incorrect Chrome installations reject exists=%s',
  async exists => {
    state.exists = exists
    state.exec.mockReturnValue('Google Chrome 0.0.0')
    const module = await import('../../../scripts/repo/browser.mts')
    expect(() => module.browserLaunchOptions()).toThrow()
  },
)
test('installation prints the verified executable and CLI invokes the installer', async () => {
  const args = process.argv
  process.argv = [args[0]!, '/browser.mts']
  const log = vi.spyOn(console, 'log').mockImplementation(() => {})
  try {
    const module = await import('../../../scripts/repo/browser.mts')
    await module.installBrowser()
    state.main = true
    vi.resetModules()
    await import('../../../scripts/repo/browser.mts')
    expect(state.install).toHaveBeenCalledTimes(2)
    expect(log).toHaveBeenCalledTimes(2)
  } finally {
    process.argv = args
  }
})
test.each(['--help', '-h'])('CLI %s skips installation', async option => {
  const args = process.argv
  process.argv = [args[0]!, '/browser.mts', option]
  state.main = true
  vi.spyOn(console, 'log').mockImplementation(() => {})
  const exit = vi.spyOn(process, 'exit').mockImplementation(() => {
    throw new Error('exit')
  })
  try {
    await expect(import('../../../scripts/repo/browser.mts')).rejects.toThrow()
    expect(exit).toHaveBeenCalledWith(0)
    expect(state.install).not.toHaveBeenCalled()
  } finally {
    process.argv = args
  }
})
