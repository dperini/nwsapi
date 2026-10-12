import { expect, test } from 'vitest'
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { execFileSync } from 'node:child_process'
import os from 'node:os'
import path from 'node:path'
import {
  quotePosix,
  quoteWindows,
  sentinelFor,
  windowsShim,
  writeFirewallShim,
} from '../../../../scripts/repo/setup/firewall.mts'
import {
  verifiedWrapper,
  wrapperStatus,
} from '../../../../scripts/repo/setup/diagnostics.mts'

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

test('manager launchers resolve Node from the checkout bin on PATH', () => {
  if (process.platform === 'win32') {
    return
  }
  const root = mkdtempSync(path.join(os.tmpdir(), 'nwsapi-shim-path-'))
  const directory = path.join(root, 'bin')
  const firewall = path.join(root, 'sfw')
  const manager = path.join(root, 'npm')
  const node = path.join(directory, 'node')
  try {
    mkdirSync(directory)
    writeFileSync(firewall, '#!/bin/bash\nexec "$@"\n', { mode: 0o755 })
    writeFileSync(manager, '#!/bin/bash\ncommand -v node\n', { mode: 0o755 })
    writeFileSync(node, '#!/bin/bash\necho pinned-node\n', { mode: 0o755 })
    const launcher = writeFirewallShim(
      'npm',
      firewall,
      { executable: manager },
      directory,
    )
    const result = execFileSync(launcher, [], {
      encoding: 'utf8',
      env: { PATH: '/usr/bin:/bin', HOME: root },
    })
    expect(result.trim()).toBe(node)
    expect(process.env['PATH']).not.toContain(directory)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('Windows shim writer output passes the checkout wrapper verifier', () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'nwsapi-shim-ready-'))
  const original = process.platform
  const node = path.join(directory, 'node.exe')
  const firewall = path.join(directory, 'sfw.exe')
  const npm = path.join(directory, 'npm-cli.js')
  Object.defineProperty(process, 'platform', { value: 'win32' })
  try {
    writeFileSync(node, 'node executable placeholder')
    writeFileSync(firewall, 'Firewall executable placeholder')
    const launcher = writeFirewallShim(
      'npm',
      firewall,
      { executable: realpathSync(node), args: [npm] },
      directory,
    )

    const written = readFileSync(launcher, 'utf8')
    expect(written.endsWith('\r\n')).toBe(true)
    expect(written).toBe(
      windowsShim(
        'npm',
        firewall,
        { executable: realpathSync(node), args: [npm] },
        directory,
      ).join('\r\n') + '\r\n',
    )
    expect(wrapperStatus('npm', directory, firewall, npm)).toBe('verified')
    expect(verifiedWrapper('npm', directory, firewall, npm)).toBe(true)
  } finally {
    Object.defineProperty(process, 'platform', { value: original })
    rmSync(directory, { recursive: true, force: true })
  }
})
