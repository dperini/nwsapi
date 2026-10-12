import { afterEach, expect, test, vi } from 'vitest'
import * as fs from 'node:fs'
import * as childProcess from 'node:child_process'

const state = vi.hoisted(() => ({
  paths: [] as string[],
  wrapper: vi.fn(() => ['wrapper']),
  spawnResult: {
    status: 0,
    signal: null,
    stdout: '12.2.0\n',
    error: undefined as (Error & { code?: string }) | undefined,
  },
}))

vi.mock('node:fs', async importOriginal => ({
  ...(await importOriginal<typeof fs>()),
  accessSync: vi.fn(),
  realpathSync: vi.fn((file: string) => {
    state.paths.push(file)
    return file
  }),
  readFileSync: vi.fn(() => 'wrapper\r\n'),
}))
vi.mock('node:child_process', () => ({
  spawnSync: vi.fn(() => state.spawnResult),
}))
vi.mock('../../../../scripts/repo/external-tools.mts', () => ({
  TOOL_BIN: '/tools/bin',
  managedNodeEntry: () => '/tools/bin/node.exe',
  toolExecutable: (name: string) => `/tools/${name}`,
  toolVersions: () => ({ node: '26.11.0', pnpm: '12.12.0' }),
}))
vi.mock('../../../../scripts/repo/lib/paths.mts', () => ({
  REPO_ROOT: '/repo',
}))
vi.mock('../../../../scripts/repo/setup/firewall.mts', () => ({
  posixShim: state.wrapper,
  windowsShim: state.wrapper,
}))
vi.mock('../../../../scripts/repo/setup/manager.mts', () => ({
  cachedToolchain: vi.fn(() => true),
  managedEnvironment: vi.fn(() => ({})),
}))

import {
  probeToolVersion,
  verifiedWrapper,
  wrapperStatus,
} from '../../../../scripts/repo/setup/diagnostics.mts'

afterEach(() => {
  vi.unstubAllGlobals()
  state.paths.length = 0
  state.wrapper.mockClear()
  state.spawnResult = {
    status: 0,
    signal: null,
    stdout: '12.2.0\n',
    error: undefined,
  }
  vi.mocked(childProcess.spawnSync).mockClear()
})

test('Windows npm wrapper verification uses the activated managed Node path', () => {
  vi.stubGlobal(
    'process',
    new Proxy(process, {
      get(target, property) {
        if (property === 'platform') {
          return 'win32'
        }
        return Reflect.get(target, property)
      },
    }),
  )

  expect(verifiedWrapper('npm')).toBe(true)
  expect(state.paths).toContain('/tools/bin/node.exe')
  expect(state.wrapper).toHaveBeenCalledWith('npm', '/tools/sfw', {
    executable: '/tools/bin/node.exe',
    args: ['/tools/npm'],
  })
  expect(fs.readFileSync).toHaveBeenCalledWith('/tools/bin/npm.cmd', 'utf8')
})

test('managed version probe reports parse and process status without raw output', () => {
  expect(probeToolVersion('/tools/bin/node.exe')).toMatchObject({
    version: '12.2.0',
    status: 0,
    signal: null,
    outputLines: 1,
    outputMatchesVersion: true,
  })

  state.spawnResult = {
    status: 1,
    signal: null,
    stdout: 'npm error with private configuration details',
    error: Object.assign(new Error('probe failed'), { code: 'EACCES' }),
  }
  expect(probeToolVersion('/tools/bin/node.exe')).toMatchObject({
    version: undefined,
    status: 1,
    signal: null,
    errorCode: 'EACCES',
    outputLines: 1,
    outputMatchesVersion: false,
  })
})

test('wrapper diagnostic identifies an absent Firewall executable', () => {
  vi.mocked(fs.accessSync).mockImplementation(() => {
    throw new Error('not found')
  })
  expect(wrapperStatus('npm')).toBe('Firewall executable missing')
})
