import { expect, test, vi } from 'vitest'
const state = vi.hoisted(() => ({ main: false, exec: vi.fn() }))
vi.mock('node:child_process', () => ({ execFileSync: state.exec }))
vi.mock('../../../scripts/repo/lib/run-node.mts', () => ({
  isMainModule: () => state.main,
}))
vi.mock('../../../scripts/repo/setup/mise.mts', () => ({
  MISE_ROOT: '/mise',
  miseEnvironment: () => ({ FIXTURE: 'yes' }),
  nubRequest: (args: string[]) => ({ command: '/nub', args }),
}))
import {
  installNodeVersions,
  NODE_INTEROP_VERSIONS,
} from '../../../scripts/repo/node.mts'
test('runtime provisioning uses the pinned matrix and isolated manager environment', () => {
  installNodeVersions()
  expect(state.exec).toHaveBeenCalledWith(
    '/nub',
    ['node', 'install', ...NODE_INTEROP_VERSIONS],
    { cwd: '/mise', env: { FIXTURE: 'yes' }, stdio: 'inherit' },
  )
})
test('direct runtime setup provisions the pinned matrix', async () => {
  state.exec.mockClear()
  state.main = true
  vi.resetModules()
  try {
    await import('../../../scripts/repo/node.mts')
    expect(state.exec).toHaveBeenCalledOnce()
  } finally {
    state.main = false
  }
})
