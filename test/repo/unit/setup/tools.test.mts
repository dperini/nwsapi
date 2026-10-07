import { afterEach, expect, test, vi } from 'vitest'
import * as fs from 'node:fs'

const state = vi.hoisted(() => ({
  platform: 'darwin' as NodeJS.Platform,
  moldPlatform: 'darwin-arm64',
  invalid: '',
  versions: {
    node: '26.11.0',
    nub: '0.9.6',
    npm: '12.2.0',
    pnpm: '12.10.1',
    mise: '2026.10.4',
    sfw: '1.15.2',
    mold: '2.43.0',
  } as Record<string, string>,
  install: vi.fn(async (plan: { name: string }) => `/verified/${plan.name}`),
  register: vi.fn(),
  shim: vi.fn(),
}))
vi.mock('node:fs', async original => ({
  ...(await original<typeof fs>()),
  realpathSync: vi.fn((file: string) => file),
  mkdirSync: vi.fn(),
  rmSync: vi.fn(),
  symlinkSync: vi.fn(),
  copyFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  appendFileSync: vi.fn(),
  existsSync: vi.fn(() => false),
  readFileSync: vi.fn(() => Buffer.from('node')),
}))
vi.mock('node:child_process', () => ({
  execFileSync: (command: string) => {
    const name =
      command === '/verified/node' ? 'npm' : command.split('/').at(-1)!
    if (name === state.invalid) {
      return 'invalid'
    }
    const version = state.versions[name]
    return name === 'mold' || name === 'mise' || name === 'sfw'
      ? `${name} ${version}`
      : `v${version}\n`
  },
}))
vi.mock('../../../../scripts/repo/lib/run-node.mts', () => ({
  isMainModule: () => false,
}))
vi.mock('../../../../scripts/repo/external-tools.mts', () => ({
  TOOL_BIN: '/tools/bin',
  TOOLCHAIN_STATE: '/tools/state.json',
  checkExternalTools: vi.fn(),
  toolchainState: () => '{"manager":"pnpm"}',
  toolVersions: () => state.versions,
  toolPlan: (name: string) => ({ name }),
  toolPlatform: () => state.moldPlatform,
}))
vi.mock('../../../../scripts/repo/node.mts', () => ({
  installNodeVersions: vi.fn(),
  NODE_INTEROP_VERSIONS: ['22.23.2'],
  nodeInteropEnvironment: () => ({}),
  resolveNodeRuntime: () => '/verified/node',
}))
vi.mock('../../../../scripts/repo/setup/install.mts', () => ({
  installTool: state.install,
}))
vi.mock('../../../../scripts/repo/setup/firewall.mts', () => ({
  writeFirewallShim: state.shim,
}))
vi.mock('../../../../scripts/repo/setup/mise.mts', () => ({
  registerNub: state.register,
}))

afterEach(() => vi.unstubAllGlobals())

async function fixture() {
  vi.resetModules()
  state.invalid = ''
  state.install.mockClear()
  state.register.mockClear()
  vi.mocked(fs.writeFileSync).mockClear()
  vi.stubGlobal(
    'process',
    new Proxy(process, {
      get(target, property) {
        if (property === 'platform') {
          return state.platform
        }
        return Reflect.get(target, property)
      },
    }),
  )
  vi.spyOn(console, 'log').mockImplementation(() => {})
  return import('../../../../scripts/repo/setup/tools.mts')
}

test('setup verifies all tools before writing the ready-state marker', async () => {
  state.platform = 'darwin'
  state.moldPlatform = 'darwin-arm64'
  const tools = await fixture()
  expect(await tools.setupTools()).toBe('/tools/bin')
  expect(state.install.mock.calls.map(([plan]) => plan.name)).toEqual([
    'nub',
    'pnpm',
    'npm',
    'sfw',
    'mise',
  ])
  expect(state.register).toHaveBeenCalledTimes(1)
  const writes = vi.mocked(fs.writeFileSync).mock.calls
  expect(writes.at(-1)![0]).toBe('/tools/state.json')
  expect(JSON.parse(writes.at(-1)![1] as string).manager).toBe('pnpm')
})

test('Linux installs and validates mold for both supported architectures', async () => {
  state.platform = 'linux'
  const platforms = ['linux-x64', 'linux-arm64']
  for (let i = 0, length = platforms.length; i < length; i += 1) {
    state.moldPlatform = platforms[i]!
    const tools = await fixture()
    await tools.setupTools()
    expect(state.install.mock.calls.at(-1)![0].name).toBe('mold')
    state.invalid = 'mold'
    await expect(tools.setupTools()).rejects.toThrow(Error)
  }
})

test('a mismatched or unparseable tool version cannot produce a ready marker', async () => {
  state.platform = 'darwin'
  state.moldPlatform = 'darwin-arm64'
  const tools = await fixture()
  const names = ['nub', 'mise', 'sfw', 'npm', 'pnpm']
  for (let i = 0, length = names.length; i < length; i += 1) {
    state.invalid = names[i]!
    await expect(tools.setupTools()).rejects.toThrow(Error)
  }
  expect(fs.writeFileSync).not.toHaveBeenCalled()
})

test('Windows activates native Node bytes and command launchers', async () => {
  state.platform = 'win32'
  const tools = await fixture()
  tools.activateTool('npm', '/verified/npm%path')
  expect(fs.writeFileSync).toHaveBeenCalledWith(
    expect.stringContaining('npm.cmd'),
    expect.any(String),
  )
  vi.mocked(fs.existsSync).mockReturnValue(false)
  tools.activateTool('node', '/verified/node')
  expect(fs.copyFileSync).toHaveBeenCalled()
  vi.mocked(fs.copyFileSync).mockClear()
  vi.mocked(fs.existsSync).mockReturnValue(true)
  tools.activateTool('node', '/verified/node')
  expect(fs.copyFileSync).not.toHaveBeenCalled()
  vi.mocked(fs.readFileSync).mockReturnValueOnce(Buffer.from('stale'))
  tools.activateTool('node', '/verified/node')
  expect(fs.copyFileSync).toHaveBeenCalledTimes(1)
})

test('the CLI requires an Actions path file before provisioning tools', async () => {
  state.platform = 'darwin'
  const tools = await fixture()
  await expect(
    tools.main(['--github-path'], tools.setupTools, vi.fn(), {}),
  ).rejects.toThrow(Error)
  expect(state.install).not.toHaveBeenCalled()
})

test('the CLI appends verified launchers to the Actions path only when requested', async () => {
  state.platform = 'darwin'
  state.moldPlatform = 'darwin-arm64'
  const tools = await fixture()
  await tools.main(['--github-path'], tools.setupTools, vi.fn(), {
    GITHUB_PATH: '/gha/path',
  })
  expect(fs.appendFileSync).toHaveBeenCalledWith('/gha/path', '/tools/bin\n')
  vi.mocked(fs.appendFileSync).mockClear()
  await tools.main([], tools.setupTools, vi.fn(), {})
  expect(fs.appendFileSync).not.toHaveBeenCalled()
})
