import { expect, test, vi } from 'vitest'
import {
  browserTestsPlan,
  main,
} from '../../../../scripts/repo/setup/browser-tests.mts'

test('browser test setup dry run lists WPT and browser targets without setup', () => {
  const log = vi.spyOn(console, 'log').mockImplementation(() => {})
  main(['--dry-run', '--json'])
  expect(JSON.parse(log.mock.calls[0]![0] as string)).toMatchObject({
    type: 'preview',
    command: 'setup/browser-tests',
    targets: expect.arrayContaining([
      expect.stringContaining('upstream/wpt'),
      expect.stringContaining('browsers'),
    ]),
  })
  expect(browserTestsPlan('/checkout', '/home').targets).toEqual([
    '/checkout/upstream/wpt',
    '/home/.cache/nwsapi/browsers',
  ])
})
