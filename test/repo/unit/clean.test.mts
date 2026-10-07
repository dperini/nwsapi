import { beforeEach, expect, test, vi } from 'vitest'
import path from 'node:path'
import type * as OS from 'node:os'
import { REPO_ROOT } from '../../../scripts/repo/lib/paths.mts'

const state = vi.hoisted(() => ({ remove: vi.fn(), execute: vi.fn() }))
vi.mock('node:fs/promises', () => ({ rm: state.remove }))
vi.mock('node:child_process', () => ({ execFileSync: state.execute }))
vi.mock('node:os', async importOriginal => ({
  ...(await importOriginal<typeof OS>()),
  homedir: () => '/fixture-home',
}))
vi.mock('../../../.config/build.config.mts', () => ({
  obsoleteOutputs: ['old/report.json', 'dist/stale.js'],
}))

beforeEach(() => {
  vi.resetModules()
  vi.clearAllMocks()
  state.remove.mockResolvedValue(undefined)
})

test('clean removes generated state and prunes before deleting provisioning cache', async () => {
  await import('../../../scripts/repo/clean.mts')
  const removed = state.remove.mock.calls.map(call => call[0])
  expect(removed).toContain(path.join(REPO_ROOT, 'node_modules'))
  expect(removed).toContain(path.join(REPO_ROOT, 'old/report.json'))
  expect(removed).toContain('/fixture-home/.cache/nwsapi/browsers')
  expect(removed).not.toContain(path.join(REPO_ROOT, 'src'))
  expect(removed).not.toContain(path.join(REPO_ROOT, 'upstream'))
  expect(removed.at(-1)).toBe(path.join(REPO_ROOT, '.cache'))
  expect(state.execute).toHaveBeenCalledExactlyOnceWith(
    'pnpm',
    ['store', 'prune'],
    { cwd: REPO_ROOT, stdio: 'inherit' },
  )
  expect(state.execute.mock.invocationCallOrder[0]).toBeLessThan(
    state.remove.mock.invocationCallOrder.at(-1)!,
  )
})

test('a failed store prune preserves the provisioned tools for retry', async () => {
  state.execute.mockImplementationOnce(() => {
    throw Object.assign(new Error('fixture'), { code: 'ERR_PRUNE_FIXTURE' })
  })
  await expect(import('../../../scripts/repo/clean.mts')).rejects.toMatchObject(
    { code: 'ERR_PRUNE_FIXTURE' },
  )
  expect(state.remove.mock.calls.map(call => call[0])).not.toContain(
    path.join(REPO_ROOT, '.cache'),
  )
})
