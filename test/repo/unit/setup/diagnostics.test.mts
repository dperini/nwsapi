import { afterEach, expect, test, vi } from 'vitest'
import * as fs from 'node:fs'

const state = vi.hoisted(() => ({
  paths: [] as string[],
  wrapper: vi.fn(() => ['wrapper']),
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
vi.mock('node:child_process', () => ({ spawnSync: vi.fn() }))
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

import { verifiedWrapper } from '../../../../scripts/repo/setup/diagnostics.mts'

afterEach(() => {
  vi.unstubAllGlobals()
  state.paths.length = 0
  state.wrapper.mockClear()
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
