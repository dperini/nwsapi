import { expect, test, vi } from 'vitest'
import manifest from '../../../.config/external-tools.json' with { type: 'json' }
import {
  checkExternalTools,
  toolPlan,
  toolPlatform,
  toolVersions,
  validAssetFormat,
  validateAsset,
  toolchainState,
  toolchainStatePath,
  toolExecutable,
} from '../../../scripts/repo/external-tools.mts'
import type { ExternalTools } from '../../../scripts/repo/external-tools.mts'

test('tool identities and state metadata use deterministic pinned paths', () => {
  const state = JSON.parse(toolchainState())
  expect(state.manager).toBe('pnpm')
  expect(state.tools).toHaveLength(5)
  expect(toolchainStatePath('/tools')).toBe('/tools/toolchain.json')
  expect(toolExecutable('npm')).toContain(manifest.tools.npm.version)
})

test('invalid source origins, missing tools, and non-string versions reject', () => {
  const absent = structuredClone(manifest)
  Reflect.deleteProperty(absent.tools, 'node')
  expect(() => toolVersions(absent)).toThrow()
  const data = structuredClone(manifest)
  data.tools.node.version = 12 as unknown as string
  expect(() => toolVersions(data)).toThrow()
  data.tools.node.version = manifest.tools.node.version
  data.tools.npm.repository = 'github:other/npm'
  expect(() => toolPlan('npm', undefined, data)).toThrow()
  const tagged = structuredClone(manifest) as ExternalTools
  tagged.tools.nub.repository = 'invalid'
  expect(() => toolPlan('nub', 'darwin-arm64', tagged)).toThrow()
  tagged.tools.nub.repository = 'github:SocketDev/nub'
  tagged.tools.nub.tag = 'custom-tag'
  expect(toolPlan('nub', 'darwin-arm64', tagged).url).toContain('/custom-tag/')
})

test('default Linux platform selection reads libc from the runtime report', () => {
  const report = vi.spyOn(process.report, 'getReport').mockReturnValue({
    header: { glibcVersionRuntime: '2.36' },
  } as unknown as ReturnType<typeof process.report.getReport>)
  expect(toolPlatform('linux', 'x64')).toBe('linux-x64')
  report.mockReturnValue({
    header: {},
  } as unknown as ReturnType<typeof process.report.getReport>)
  expect(toolPlatform('linux', 'x64')).toBe('linux-x64-musl')
})

test('schema validation failures expose a stable tool configuration code', () => {
  const data = structuredClone(manifest)
  data.tools.node.version = 'latest'
  expect(() => checkExternalTools(data)).toThrow(
    expect.objectContaining({ code: 'ERR_TOOL_CONFIG' }),
  )
})

test('semantic pins remain checked independently of schema validation', async () => {
  vi.doMock('../../../.config/generated/external-tools.mts', () => ({
    validate: () => ({ valid: true, errors: [] }),
  }))
  vi.resetModules()
  try {
    const { checkExternalTools: check } =
      await import('../../../scripts/repo/external-tools.mts')
    for (const field of ['origin', 'package', 'python', 'project'] as const) {
      const data = structuredClone(manifest)
      data.tools.pytorch[field] = 'invalid'
      expect(() => check(data)).toThrow()
    }
    const data = structuredClone(manifest)
    data.tools.nub.platforms = {} as typeof data.tools.nub.platforms
    expect(() => check(data)).toThrow()
  } finally {
    vi.doUnmock('../../../.config/generated/external-tools.mts')
    vi.resetModules()
  }
})

test('direct tool configuration verification prints pinned versions', async () => {
  vi.doMock('../../../scripts/repo/lib/run-node.mts', () => ({
    isMainModule: (url: string) => url.endsWith('/external-tools.mts'),
  }))
  vi.resetModules()
  const log = vi.spyOn(console, 'log').mockImplementation(() => {})
  try {
    await import('../../../scripts/repo/external-tools.mts')
    expect(JSON.parse(log.mock.calls[0]?.[0] as string).node).toBe(
      manifest.tools.node.version,
    )
  } finally {
    vi.doUnmock('../../../scripts/repo/lib/run-node.mts')
    vi.resetModules()
  }
})

test('every declared platform has a pinned release URL and integrity', () => {
  checkExternalTools()
  for (const name of ['pnpm', 'nub', 'sfw', 'mold', 'tak'] as const) {
    for (const platform of Object.keys(manifest.tools[name].platforms)) {
      const plan = toolPlan(name, platform)
      expect(plan.url).toBe(
        `https://github.com/${manifest.tools[name].repository.slice(7)}/releases/download/v${plan.version}/${plan.asset}`,
      )
      expect(plan.integrity).toMatch(/^sha(?:256|512)-/)
    }
  }
  expect(toolPlan('npm').url).toBe(
    'https://registry.npmjs.org/npm/-/npm-' +
      manifest.tools.npm.version +
      '.tgz',
  )
  expect(toolPlan('mold', 'linux-x64')).toMatchObject({
    version: '3.0.0',
    asset: 'mold-3.0.0-x86_64-linux.tar.gz',
    binary: 'mold-3.0.0-x86_64-linux/bin/mold',
  })
})

test('exact versions and valid sources are required', () => {
  expect(Object.getPrototypeOf(toolVersions())).toBeNull()
  for (const version of [
    '26',
    'latest',
    '26\nOTHER=value',
    '26; echo unsafe',
  ]) {
    const data = structuredClone(manifest)
    data.tools.node.version = version
    expect(() => toolVersions(data)).toThrow(
      'Invalid external tool configuration',
    )
  }
  const data = structuredClone(manifest)
  data.tools.pnpm.origin = 'system'
  expect(() => toolVersions(data)).toThrow(
    'Invalid external tool configuration',
  )
})

test('missing platforms and unsafe archive paths fail closed', () => {
  expect(() => toolPlan('nub', 'linux-riscv64')).toThrow('Missing or invalid')
  for (const binary of ['/tmp/nub', '../nub', 'bin/../../nub']) {
    const data = structuredClone(manifest)
    data.tools.nub.platforms['darwin-arm64'].binary = binary
    expect(() => toolPlan('nub', 'darwin-arm64', data)).toThrow(
      'Missing or invalid',
    )
  }
})

test('Linux libc and architecture select distinct assets', () => {
  expect(toolPlatform('linux', 'arm64', true)).toBe('linux-arm64-musl')
  expect(toolPlatform('linux', 'x64', false)).toBe('linux-x64')
  expect(toolPlatform('darwin', 'arm64', false)).toBe('darwin-arm64')
  expect(toolPlan('nub', 'linux-x64-musl').asset).toBe(
    'nub-linux-x64-musl.tar.gz',
  )
  expect(toolPlan('pnpm', 'win32-arm64').binary).toBe('pnpm.exe')
  expect(toolPlan('sfw', 'win32-arm64')).toMatchObject({
    asset: 'sfw-free-windows-arm64.exe',
    binary: 'sfw.exe',
    format: 'binary',
  })
})

test('bare releases require an explicit format and safe asset paths', () => {
  const pin = toolPlan('sfw', 'linux-x64')
  expect(validAssetFormat(pin)).toBe(true)
  expect(validAssetFormat({ ...pin, format: 'archive' })).toBe(false)
  expect(validAssetFormat({ ...pin, format: 'unknown' })).toBe(false)
  expect(() => validateAsset(pin)).not.toThrow()
  for (const asset of ['../sfw', '/tmp/sfw', '.', '..', 'sfw;command']) {
    expect(() => validateAsset({ ...pin, asset })).toThrow('Missing or invalid')
  }
})
