import { expect, test, vi } from 'vitest'
const state = vi.hoisted(() => ({
  main: false,
  fail: false,
  close: vi.fn(),
  brand: vi.fn(),
  goto: vi.fn(),
  launch: vi.fn(),
}))
vi.mock('@playwright/test', () => ({ chromium: { launch: state.launch } }))
vi.mock('../../../scripts/repo/browser.mts', () => ({
  browserLaunchOptions: () => ({ executablePath: '/chrome' }),
}))
vi.mock('../../../scripts/repo/lib/agent-browser.mts', () => ({
  brandAgentBrowser: state.brand,
}))
vi.mock('../../../scripts/repo/lib/run-node.mts', () => ({
  isMainModule: () => state.main,
}))
import { agentBrowserUrl, main } from '../../../scripts/repo/agent-browser.mts'

test('the agent browser accepts web URLs and rejects executable or local-file schemes', () => {
  expect(agentBrowserUrl([])).toBe('http://127.0.0.1:8765/')
  expect(agentBrowserUrl(['https://example.org'])).toBe('https://example.org/')
  for (const args of [
    ['javascript:alert(1)'],
    ['file:///etc/passwd'],
    ['https://a', 'https://b'],
  ]) {
    expect(() => agentBrowserUrl(args)).toThrow()
  }
})

test('interactive browser branding waits for disconnect and closes the browser', async () => {
  state.launch.mockResolvedValue({
    newContext: async () => ({ newPage: async () => ({ goto: state.goto }) }),
    once: (_event: string, listener: () => void) => listener(),
    close: state.close,
  })
  await main(['https://example.org'])
  expect(state.goto).toHaveBeenCalledWith('https://example.org/')
  expect(state.brand).toHaveBeenCalledOnce()
  expect(state.close).toHaveBeenCalledOnce()
  state.goto.mockRejectedValueOnce(new Error('navigation failed'))
  await expect(main(['https://example.org'])).rejects.toThrow()
  expect(state.close).toHaveBeenCalledTimes(2)
})
test('help and direct invocation use the same command entry', async () => {
  const args = process.argv
  process.argv = [args[0]!, '/agent-browser.mts', '--help']
  const log = vi.spyOn(console, 'log').mockImplementation(() => {})
  try {
    await main()
    await main(['-h'])
    state.main = true
    vi.resetModules()
    await import('../../../scripts/repo/agent-browser.mts')
    expect(log).toHaveBeenCalledTimes(3)
  } finally {
    state.main = false
    process.argv = args
  }
})
