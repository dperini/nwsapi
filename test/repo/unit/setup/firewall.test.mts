import { expect, test } from 'vitest'
import { mkdtempSync, rmSync, statSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  quotePosix,
  quoteWindows,
  sentinelFor,
  writeFirewallShim,
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

test.each([
  { name: 'npm', platform: 'darwin', configured: false, args: undefined },
  { name: 'pnpm', platform: 'darwin', configured: true, args: [] },
  { name: 'npm', platform: 'darwin', configured: true, args: undefined },
  { name: 'pnpm', platform: 'win32', configured: false, args: undefined },
  { name: 'pnpm', platform: 'win32', configured: true, args: [] },
  { name: 'npm', platform: 'win32', configured: true, args: undefined },
] as const)(
  'writes an atomic $platform $name launcher configured=$configured',
  ({ name, platform, configured, args }) => {
    const directory = mkdtempSync(path.join(os.tmpdir(), 'nwsapi-shim-write-'))
    const original = process.platform
    Object.defineProperty(process, 'platform', { value: platform })
    try {
      const target = writeFirewallShim(
        name,
        configured ? '/firewall' : undefined,
        configured
          ? { executable: '/manager', ...(args ? { args: [...args] } : {}) }
          : undefined,
        directory,
      )
      expect(path.basename(target)).toBe(
        platform === 'win32' ? `${name}.cmd` : name,
      )
      expect(statSync(target).isFile()).toBe(true)
      expect(statSync(target).size).toBeGreaterThan(0)
    } finally {
      Object.defineProperty(process, 'platform', { value: original })
      rmSync(directory, { recursive: true, force: true })
    }
  },
)
