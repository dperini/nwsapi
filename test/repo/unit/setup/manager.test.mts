import path from 'node:path'
import os from 'node:os'
import { afterEach, expect, test, vi } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import type * as fs from 'node:fs'
import {
  ensureManagedTools,
  firewallLaunchersReady,
  handoff,
  managedEnvironment,
  setupNotice,
} from '../../../../scripts/repo/setup/manager.mts'
import {
  toolchainState,
  toolVersions,
  toolExecutable,
} from '../../../../scripts/repo/external-tools.mts'
import { writeFirewallShim } from '../../../../scripts/repo/setup/firewall.mts'

vi.mock('node:fs', async importOriginal => ({
  ...(await importOriginal<typeof fs>()),
  existsSync: vi.fn(() => true),
  readFileSync: vi.fn(),
}))
afterEach(() => vi.unstubAllGlobals())

test('missing PATH and package-manager identity remain valid managed inputs', () => {
  expect(managedEnvironment('/tools', {})['PATH']).toContain('/tools')
  expect(setupNotice(undefined)).toBeTypeOf('string')
})

test('cached tool setup repairs launchers that point to an old checkout path', async () => {
  const actualFs = await vi.importActual<typeof fs>('node:fs')
  const directory = actualFs.mkdtempSync(
    path.join(os.tmpdir(), 'nwsapi-launcher-path-'),
  )
  try {
    const node = '/managed/node'
    const commands = {
      npm: { executable: node, args: [toolExecutable('npm')] },
      pnpm: { executable: toolExecutable('pnpm') },
    }
    const sfw = toolExecutable('sfw')
    for (const name of ['npm', 'pnpm'] as const) {
      writeFirewallShim(name, sfw, commands[name], directory)
    }
    const read = actualFs.readFileSync as typeof readFileSync
    const resolve = () => node
    expect(
      firewallLaunchersReady(directory, process.platform, read, resolve),
    ).toBe(true)
    actualFs.writeFileSync(
      path.join(directory, process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm'),
      'stale launcher',
    )
    expect(
      firewallLaunchersReady(directory, process.platform, read, resolve),
    ).toBe(false)
    const setup = vi.fn(async () => directory)
    await ensureManagedTools(
      directory,
      setup,
      () => ({ status: 0, stdout: `v${toolVersions()['node']}` }),
      candidate =>
        firewallLaunchersReady(candidate, process.platform, read, resolve),
    )
    expect(setup).toHaveBeenCalledOnce()
  } finally {
    actualFs.rmSync(directory, { recursive: true, force: true })
  }
})

test('missing launchers and pinned binaries trigger repair even with valid state', async () => {
  vi.mocked(readFileSync).mockReturnValue(toolchainState())
  const setup = vi.fn(async () => '/tools')
  const probe = () => ({ status: 0, stdout: `v${toolVersions()['node']}` })
  vi.mocked(existsSync).mockImplementation(
    file =>
      file !==
      path.join('/tools', process.platform === 'win32' ? 'npm.cmd' : 'npm'),
  )
  await ensureManagedTools('/tools', setup, probe, () => true)
  expect(setup).toHaveBeenCalledTimes(1)
  vi.mocked(existsSync).mockImplementation(
    file => file !== toolExecutable('npm'),
  )
  await ensureManagedTools('/tools', setup, probe, () => true)
  expect(setup).toHaveBeenCalledTimes(2)
})

test('failed and empty Node version probes require repair', async () => {
  vi.mocked(existsSync).mockReturnValue(true)
  vi.mocked(readFileSync).mockReturnValue(toolchainState())
  const setup = vi.fn(async () => '/tools')
  await ensureManagedTools('/tools', setup, () => ({ status: 1, stdout: '' }))
  await ensureManagedTools('/tools', setup, () => ({ status: 0, stdout: null }))
  expect(setup).toHaveBeenCalledTimes(2)
})

test('Windows tool checks and handoff select the executable Node launcher', async () => {
  vi.stubGlobal(
    'process',
    new Proxy(process, {
      get: (target, property) =>
        property === 'platform' ? 'win32' : Reflect.get(target, property),
    }),
  )
  vi.mocked(existsSync).mockReturnValue(true)
  vi.mocked(readFileSync).mockReturnValue(toolchainState())
  const setup = vi.fn(async () => '/tools')
  const probe = vi.fn((_command: string) => ({
    status: 0,
    stdout: `v${toolVersions()['node']}`,
  }))
  await ensureManagedTools('/tools', setup, probe, () => true)
  expect(probe.mock.calls[0]![0]).toContain('node.exe')
  expect(setup).not.toHaveBeenCalled()
  const run = vi.fn((_args: string[]) => ({ status: 0, signal: null }))
  await handoff('/entry.mts', [], async () => '/tools', run)
  expect(run.mock.calls[0]![0][1]).toContain('node.exe')
})
