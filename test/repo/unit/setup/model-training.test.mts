import { beforeEach, expect, test, vi } from 'vitest'
import manifest from '../../../../.config/external-tools.json' with { type: 'json' }
import { REPO_ROOT } from '../../../../scripts/repo/lib/paths.mts'

const state = vi.hoisted(() => ({
  main: false,
  install: vi.fn(),
  checked: vi.fn(),
  plan: vi.fn(),
}))
vi.mock('../../../../scripts/repo/lib/run-node.mts', () => ({
  isMainModule: () => state.main,
}))
vi.mock('../../../../scripts/repo/lib/command.mts', () => ({
  checked: state.checked,
}))
vi.mock('../../../../scripts/repo/external-tools.mts', () => ({
  toolPlan: state.plan,
}))
vi.mock('../../../../scripts/repo/setup/install.mts', () => ({
  installTool: state.install,
}))
import { setupModelTraining } from '../../../../scripts/repo/setup/model-training.mts'

beforeEach(() => {
  vi.clearAllMocks()
  state.main = false
  state.plan.mockReturnValue({ tool: 'uv' })
  state.install.mockResolvedValue('/fixture/uv')
  state.checked.mockReturnValue(manifest.tools.pytorch.version)
})
test('training setup synchronizes the pinned project and verifies PyTorch', async () => {
  await setupModelTraining()
  expect(state.plan).toHaveBeenCalledExactlyOnceWith('uv')
  expect(state.install).toHaveBeenCalledWith({ tool: 'uv' })
  expect(state.checked.mock.calls[0]![1]).toEqual([
    'sync',
    '--project',
    `${REPO_ROOT}/${manifest.tools.pytorch.project}`,
    '--python',
    manifest.tools.pytorch.python,
    '--locked',
  ])
  expect(state.checked.mock.calls[0]![2]).toMatchObject({
    cwd: REPO_ROOT,
    interactive: true,
    env: { UV_CACHE_DIR: `${REPO_ROOT}/.cache/uv` },
  })
  expect(state.checked.mock.calls[1]![1]).toContain(
    'import torch; print(torch.__version__)',
  )
})
test('a mismatching trainer version fails setup', async () => {
  state.checked.mockReturnValue('0.0.0')
  await expect(setupModelTraining()).rejects.toBeInstanceOf(Error)
})
test('CLI runs the same pinned setup', async () => {
  vi.resetModules()
  state.main = true
  await import('../../../../scripts/repo/setup/model-training.mts')
  expect(state.install).toHaveBeenCalledOnce()
})
