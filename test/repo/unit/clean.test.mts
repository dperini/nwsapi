import { beforeEach, expect, test, vi } from 'vitest'
import path from 'node:path'
import { REPO_ROOT } from '../../../scripts/repo/lib/paths.mts'
import { main } from '../../../scripts/repo/clean.mts'

const state = vi.hoisted(() => ({ remove: vi.fn() }))
vi.mock('node:fs/promises', () => ({ rm: state.remove }))

beforeEach(() => {
  vi.clearAllMocks()
  state.remove.mockResolvedValue(undefined)
})

function removedPaths() {
  return state.remove.mock.calls.map(call => path.relative(REPO_ROOT, call[0]))
}

test('ordinary clean removes only generated outputs', async () => {
  await main([], vi.fn())
  expect(removedPaths()).toEqual([
    'dist',
    'coverage',
    'playwright-report',
    'test-results',
    '.tmp',
  ])
  expect(state.remove).toHaveBeenCalledWith(path.join(REPO_ROOT, 'dist'), {
    force: true,
    recursive: true,
  })
})

test.each(['dependencies', 'tools'])(
  'reset %s previews until explicitly applied',
  async scope => {
    await main(['--scope', scope], vi.fn())
    expect(state.remove).not.toHaveBeenCalled()
    await main(['--scope', scope, '--apply'], vi.fn())
    expect(removedPaths()).toEqual(
      scope === 'dependencies'
        ? ['node_modules']
        : [
            path.join('.cache', 'bin'),
            path.join('.cache', 'external-tools'),
            path.join('.cache', 'mise'),
            path.join('.cache', 'setup-progress.json'),
          ],
    )
  },
)

test('dry run overrides apply and help makes no changes', async () => {
  await main(['--scope', 'tools', '--apply', '--dry-run'], vi.fn())
  await main(['--help'], vi.fn())
  expect(state.remove).not.toHaveBeenCalled()
})

test('unknown scopes and removal errors stop cleanup', async () => {
  await expect(
    main(['--scope', '../other-checkout'], vi.fn()),
  ).rejects.toThrow()
  expect(state.remove).not.toHaveBeenCalled()
  const error = new Error('Permission denied')
  state.remove.mockRejectedValueOnce(error)
  await expect(main([], vi.fn())).rejects.toBe(error)
  expect(removedPaths()).toEqual(['dist'])
})
