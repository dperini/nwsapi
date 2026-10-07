import { expect, test, vi } from 'vitest'
import { checkCode } from '../../../../scripts/repo/check/run.mts'
import { runTasks } from '../../../../scripts/repo/lib/task.mts'
import { runNode } from '../../../../scripts/repo/lib/run-node.mts'
import type * as NodeRunner from '../../../../scripts/repo/lib/run-node.mts'

const state = vi.hoisted(() => ({ main: false }))
vi.mock('../../../../scripts/repo/lib/task.mts', () => ({ runTasks: vi.fn() }))
vi.mock('../../../../scripts/repo/lib/run-node.mts', async importOriginal => ({
  ...(await importOriginal<typeof NodeRunner>()),
  isMainModule: (url: string) => state.main && url.endsWith('/check/run.mts'),
  runNode: vi.fn(),
}))

test('code checks pass the selected runner to the task dispatcher', () => {
  const run = vi.fn()
  checkCode(run)
  expect(runTasks).toHaveBeenLastCalledWith('check', [], run)
  checkCode()
  expect(runTasks).toHaveBeenLastCalledWith('check', [], runNode)
})

test('check CLI accepts the complete check lane, rejects unknown flags and provides help', async () => {
  const argv = process.argv
  const log = vi.spyOn(console, 'log').mockImplementation(() => {})
  state.main = true
  try {
    process.argv = ['node', 'run.mts', '--help']
    vi.resetModules()
    await import('../../../../scripts/repo/check/run.mts')
    expect(log).toHaveBeenCalledOnce()
    process.argv = ['node', 'run.mts', '--invalid']
    vi.resetModules()
    await expect(
      import('../../../../scripts/repo/check/run.mts'),
    ).rejects.toThrow()
    const options = [[], ['--all']]
    for (let i = 0, length = options.length; i < length; i += 1) {
      process.argv = ['node', 'run.mts', ...options[i]!]
      vi.resetModules()
      await import('../../../../scripts/repo/check/run.mts')
      expect(runTasks).toHaveBeenLastCalledWith('check', [], runNode)
    }
  } finally {
    process.argv = argv
    state.main = false
  }
})
