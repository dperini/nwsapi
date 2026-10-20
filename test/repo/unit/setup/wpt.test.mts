import { expect, test, vi } from 'vitest'
import {
  main,
  setupWpt,
  wptSetupPlan,
} from '../../../../scripts/repo/setup/wpt.mts'

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
    expect(run.mock.calls.map(([, , options]) => options)).toEqual([
      { externalGit: true },
      { externalGit: true },
    ])
  } finally {
    vi.doUnmock('../../../../scripts/repo/lib/run-node.mts')
  }
})
test('an explicit runner observes exactly the two checkout operations', () => {
  const run = vi.fn()
  setupWpt(run)
  expect(run).toHaveBeenCalledTimes(2)
  expect(run.mock.calls.every(([, , options]) => options.externalGit)).toBe(
    true,
  )
})

test('WPT setup dry run reports the clone target without running git', () => {
  const log = vi.spyOn(console, 'log').mockImplementation(() => {})
  main(['--dry-run', '--json'])
  expect(JSON.parse(log.mock.calls[0]![0] as string)).toMatchObject({
    type: 'preview',
    command: 'setup/wpt',
    targets: expect.arrayContaining([expect.stringContaining('upstream/wpt')]),
  })
  expect(wptSetupPlan('/checkout').targets).toEqual(['/checkout/upstream/wpt'])
})
