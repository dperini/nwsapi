import { beforeEach, expect, test, vi } from 'vitest'
const state = vi.hoisted(() => ({
  main: false,
  platform: 'darwin-arm64',
  install: vi.fn(),
  execute: vi.fn(),
  activate: vi.fn(),
  plan: vi.fn(),
}))
vi.mock('node:child_process', () => ({ execFileSync: state.execute }))
vi.mock('../../../../scripts/repo/lib/run-node.mts', () => ({
  isMainModule: () => state.main,
}))
vi.mock('../../../../scripts/repo/external-tools.mts', () => ({
  toolPlatform: () => state.platform,
  toolPlan: state.plan,
  toolVersions: () => ({ tak: '1.2.3' }),
}))
vi.mock('../../../../scripts/repo/setup/install.mts', () => ({
  installTool: state.install,
}))
vi.mock('../../../../scripts/repo/setup/tools.mts', () => ({
  activateTool: state.activate,
}))
import { setupTak } from '../../../../scripts/repo/setup/tak.mts'
beforeEach(() => {
  vi.clearAllMocks()
  state.main = false
  state.platform = 'darwin-arm64'
  state.install.mockResolvedValue('/fixture/tak')
  state.execute.mockReturnValue('tak 1.2.3\n')
})
test('tak activation requires a successful pinned binary version', async () => {
  expect(await setupTak()).toBe('/fixture/tak')
  expect(state.plan).toHaveBeenCalledWith('tak', 'darwin-arm64')
  expect(state.execute).toHaveBeenCalledWith('/fixture/tak', ['--version'], {
    encoding: 'utf8',
  })
  expect(state.activate).toHaveBeenCalledWith('tak', '/fixture/tak')
})
test('unsupported platforms fail before downloading', async () => {
  state.platform = 'unsupported'
  await expect(setupTak()).rejects.toBeInstanceOf(Error)
  expect(state.install).not.toHaveBeenCalled()
})
test('wrong binary versions are never activated', async () => {
  state.execute.mockReturnValue('tak 0.0.0')
  await expect(setupTak()).rejects.toBeInstanceOf(Error)
  expect(state.activate).not.toHaveBeenCalled()
})
test('CLI verifies and activates tak', async () => {
  vi.resetModules()
  state.main = true
  vi.spyOn(console, 'log').mockImplementation(() => {})
  await import('../../../../scripts/repo/setup/tak.mts')
  expect(state.activate).toHaveBeenCalledOnce()
})
