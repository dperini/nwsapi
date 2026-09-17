import { expect, test } from 'vitest'
import {
  quotePosix,
  quoteWindows,
  sentinelFor,
} from '../../../../scripts/repo/setup/firewall.mts'

test('shell arguments escape embedded delimiters and Windows variable expansion', () => {
  expect(quotePosix("a'b $c")).toBe("'a'\\''b $c'")
  expect(quoteWindows('C:\\Program Files\\%tool%')).toBe(
    '"C:\\Program Files\\%%tool%%"',
  )
})

test('each manager has its own recursion sentinel', () => {
  expect(sentinelFor('npm')).toBe('SOCKET_SHIM_ACTIVE_NPM')
  expect(sentinelFor('pnpm')).toBe('SOCKET_SHIM_ACTIVE_PNPM')
})
