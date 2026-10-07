import { expect, test, vi } from 'vitest'
import path from 'node:path'
import { REPO_ROOT } from '../../../../scripts/repo/lib/paths.mts'
import { spawnSync } from 'node:child_process'
import { bootstrap, main } from '../../../../scripts/repo/setup/bootstrap.mts'
import {
  managedCommand,
  managedEnvironment,
  handoff,
  executeManaged,
  ensureManagedTools,
  setupNotice,
  cachedToolchain,
} from '../../../../scripts/repo/setup/manager.mts'
import type { ManagedRun } from '../../../../scripts/repo/setup/manager.mts'
import {
  TOOL_BIN,
  toolchainState,
} from '../../../../scripts/repo/external-tools.mts'

test('setup provisions tools before installing with the frozen branch lockfile', async () => {
  const order: string[] = []
  const setup = vi.fn(async () => {
    order.push('tools')
    return '/tools'
  })
  const run = vi.fn(() => {
    order.push('install')
    return { status: 7, signal: null }
  })
  const result = await bootstrap(false, setup, run)
  expect(order).toEqual(['tools', 'install'])
  expect(run).toHaveBeenCalledWith(['install', '--frozen-lockfile'], '/tools')
  expect(result.status).toBe(7)
})

test('managed execution preserves argument boundaries and child status', () => {
  const request = managedCommand(['exec', 'argument with spaces'], '/tools')
  const result = spawnSync(process.execPath, ['-e', 'process.exit(7)'], {
    cwd: REPO_ROOT,
  })
  const run = vi.fn(() => result)
  expect(
    executeManaged(['exec', 'argument with spaces'], '/tools', run).status,
  ).toBe(7)
  expect(run).toHaveBeenCalledWith(
    request.command,
    request.args,
    expect.objectContaining({ stdio: 'inherit' }),
  )
})

test('managed execution throws the original spawn error code', () => {
  const result = spawnSync('/missing-nwsapi-command', [], { cwd: REPO_ROOT })
  expect(() => executeManaged([], '/tools', () => result)).toThrow(
    expect.objectContaining({ code: 'ENOENT' }),
  )
})

test('tools-only setup does not start a dependency installation', async () => {
  const run = vi.fn()
  await bootstrap(true, async () => '/tools', run)
  expect(run).not.toHaveBeenCalled()
})

test('help exits successfully without provisioning tools', async () => {
  const run = vi.fn<typeof bootstrap>()
  const log = vi.fn()
  expect((await main(['--help'], run, log)).status).toBe(0)
  expect(run).not.toHaveBeenCalled()
  expect(log).toHaveBeenCalledTimes(1)
})

test('the CLI passes the tools-only flag to setup and returns its status', async () => {
  const run = vi
    .fn<typeof bootstrap>()
    .mockResolvedValue({ status: 7, signal: null })
  expect((await main(['--tools-only'], run, vi.fn())).status).toBe(7)
  expect(run).toHaveBeenCalledWith(true)
  expect((await main(['--', '--tools-only'], run, vi.fn())).status).toBe(7)
  expect(() => setupNotice('npm/12')).not.toThrow()
  expect(() => setupNotice('pnpm/12')).not.toThrow()
  expect(() => setupNotice('')).not.toThrow()
})

test('missing launchers trigger local tool provisioning', async () => {
  const setup = vi.fn(async () => '/tools')
  await ensureManagedTools('/missing-nwsapi-toolchain', setup)
  expect(setup).toHaveBeenCalledTimes(1)
})

test('a valid cached toolchain is reused, but an older Node version is repaired', async () => {
  const setup = vi.fn(async () => TOOL_BIN)
  await ensureManagedTools(TOOL_BIN, setup)
  expect(setup).not.toHaveBeenCalled()
  await ensureManagedTools(TOOL_BIN, setup, () => ({
    status: 0,
    stdout: 'v0.0.0',
  }))
  expect(setup).toHaveBeenCalledTimes(1)
})

test('branch changes and missing tool state require local launcher repair', () => {
  expect(cachedToolchain('/tools', () => toolchainState())).toBe(true)
  const master = { ...JSON.parse(toolchainState()), manager: 'npm' }
  expect(cachedToolchain('/tools', () => JSON.stringify(master))).toBe(false)
  expect(
    cachedToolchain('/tools', () => {
      throw Object.assign(new Error('missing'), { code: 'ENOENT' })
    }),
  ).toBe(false)
})

test('successful repeat installs explicitly restore generated runtime outputs', async () => {
  const run = vi.fn<ManagedRun>(() => ({ status: 0, signal: null }))
  await bootstrap(false, async () => '/tools', run)
  expect(run.mock.calls).toEqual([
    [['install', '--frozen-lockfile'], '/tools'],
    [['run', 'prepare'], '/tools'],
  ])
})

test('an interrupted install does not start preparation', async () => {
  const run = vi.fn<ManagedRun>(() => ({ status: null, signal: 'SIGINT' }))
  const result = await bootstrap(false, async () => '/tools', run)
  expect(result.signal).toBe('SIGINT')
  expect(run).toHaveBeenCalledTimes(1)
})

test('handoff keeps the entry arguments without re-running the parent lifecycle', async () => {
  const run = vi.fn<ManagedRun>(() => ({ status: 0, signal: null }))
  await handoff(
    '/repo/check.mts',
    ['--check', 'an argument with spaces'],
    async () => '/tools',
    run,
  )
  expect(run.mock.calls[0]?.[0]).toEqual([
    'exec',
    path.join('/tools', process.platform === 'win32' ? 'node.exe' : 'node'),
    '/repo/check.mts',
    '--check',
    'an argument with spaces',
  ])
})

test('managed children do not inherit the original package manager identity', () => {
  const env = managedEnvironment('/tools', {
    PATH: '/system',
    npm_config_user_agent: 'npm/12',
    npm_lifecycle_event: 'setup',
    NODE_OPTIONS: '--inspect',
    CUSTOM_VALUE: 'retained',
  })
  expect(env['PATH']).toContain('/tools')
  expect(env['CUSTOM_VALUE']).toBe('retained')
  expect(env['npm_lifecycle_event']).toBeUndefined()
  expect(env['npm_config_user_agent']).toBeUndefined()
  expect(env['NODE_OPTIONS']).toBeUndefined()
})

test('manager arguments stay separate from shell syntax on Windows', () => {
  const args = ['exec', 'file with spaces', 'argument&value']
  const request = managedCommand(args, '/tools', 'win32')
  expect(request.command).not.toContain('cmd.exe')
  expect(request.args.slice(1)).toEqual(args)
})
