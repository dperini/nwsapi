import { expect, test, vi } from 'vitest'
import { setupWpt } from '../../../../scripts/repo/setup/wpt.mts'

test('CLI clones then verifies through the default runner', async () => {
  vi.resetModules()
  const run = vi.fn()
  vi.doMock('../../../../scripts/repo/lib/run-node.mts', () => ({
    isMainModule: () => true,
    runNode: run,
  }))
  try {
    await import('../../../../scripts/repo/setup/wpt.mts')
    expect(run.mock.calls.map(([, args]) => args)).toEqual([
      ['clone', 'upstream/wpt'],
      ['verify', 'upstream/wpt'],
    ])
  } finally {
    vi.doUnmock('../../../../scripts/repo/lib/run-node.mts')
  }
})
test('an explicit runner observes exactly the two checkout operations', () => {
  const run = vi.fn()
  setupWpt(run)
  expect(run).toHaveBeenCalledTimes(2)
})
