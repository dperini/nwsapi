import { execFileSync } from 'node:child_process'
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
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
  managedNodeEntry,
  toolExecutable,
  resolveToolRoot,
} from '../../../scripts/repo/external-tools.mts'
import { writeFirewallShim } from '../../../scripts/repo/setup/firewall.mts'
import { verifiedWrapper } from '../../../scripts/repo/setup/diagnostics.mts'
import type { ExternalTools } from '../../../scripts/repo/external-tools.mts'

test('tool identities and state metadata use deterministic pinned paths', () => {
  const state = JSON.parse(toolchainState())
  expect(state.manager).toBe('pnpm')
  expect(state.tools).toHaveLength(5)
  expect(toolchainStatePath('/tools')).toBe('/tools/toolchain.json')
  expect(toolExecutable('npm')).toContain(manifest.tools.npm.version)
})

test('managed Node entry uses the native Windows executable path', () => {
  expect(managedNodeEntry('/tools/bin', 'win32')).toBe('/tools/bin/node.exe')
  expect(managedNodeEntry('/tools/bin', 'linux')).toBe('/tools/bin/node')
})

test('Windows tool roots converge symlink aliases while POSIX preserves input paths', () => {
  const temporary = mkdtempSync(path.join(os.tmpdir(), 'nwsapi-tool-root-'))
  const checkout = path.join(temporary, 'checkout')
  const shortAlias = path.join(temporary, 'short')
  const longAlias = path.join(temporary, 'long')
  const symlinkType = process.platform === 'win32' ? 'junction' : 'dir'
  mkdirSync(checkout)
  symlinkSync(checkout, shortAlias, symlinkType)
  symlinkSync(checkout, longAlias, symlinkType)
  try {
    const shortRoot = resolveToolRoot(shortAlias, 'win32')
    const longRoot = resolveToolRoot(longAlias, 'win32')
    expect(shortRoot).toBe(realpathSync.native(checkout))
    expect(longRoot).toBe(shortRoot)
    expect(resolveToolRoot(shortAlias, 'darwin')).toBe(shortAlias)
    expect(() =>
      resolveToolRoot(shortAlias, 'win32', () => {
        throw new Error('path resolution failed')
      }),
    ).toThrow('path resolution failed')
    expect(path.join(shortRoot, '.cache', 'bin')).toBe(
      path.join(longRoot, '.cache', 'bin'),
    )
    expect(path.join(shortRoot, '.cache', 'external-tools')).toBe(
      path.join(longRoot, '.cache', 'external-tools'),
    )
  } finally {
    rmSync(temporary, { recursive: true, force: true })
  }
})

test('symlink-preserved module imports derive canonical Windows tool paths', () => {
  const temporary = mkdtempSync(path.join(os.tmpdir(), 'nwsapi-tool-import-'))
  const alias = path.join(temporary, 'checkout-alias')
  const symlinkType = process.platform === 'win32' ? 'junction' : 'dir'
  const repository = realpathSync.native(path.resolve('.'))
  symlinkSync(repository, alias, symlinkType)
  try {
    const pathsUrl = pathToFileURL(
      path.join(alias, 'scripts/repo/lib/paths.mts'),
    ).href
    const toolsUrl = pathToFileURL(
      path.join(alias, 'scripts/repo/external-tools.mts'),
    ).href
    const script = [
      "Object.defineProperty(process, 'platform', { value: 'win32' })",
      `const paths = await import(${JSON.stringify(pathsUrl)})`,
      `const tools = await import(${JSON.stringify(toolsUrl)})`,
      'console.log(JSON.stringify({ root: paths.REPO_ROOT, bin: tools.TOOL_BIN, cache: tools.TOOL_CACHE }))',
    ].join(';')
    const output = execFileSync(
      process.execPath,
      ['--preserve-symlinks', '--input-type=module', '-e', script],
      { encoding: 'utf8', env: { ...process.env, NODE_OPTIONS: '' } },
    )
    const paths = JSON.parse(output) as {
      root: string
      bin: string
      cache: string
    }
    const physicalRoot = realpathSync.native(alias)
    expect(paths.root).toBe(path.resolve(alias))
    expect(paths.bin).toBe(path.join(physicalRoot, '.cache', 'bin'))
    expect(paths.cache).toBe(
      path.join(physicalRoot, '.cache', 'external-tools'),
    )
  } finally {
    rmSync(temporary, { recursive: true, force: true })
  }
})

test('Windows wrapper bytes are stable across aliases and reject edits', () => {
  const temporary = mkdtempSync(path.join(os.tmpdir(), 'nwsapi-tool-wrap-'))
  const checkout = path.join(temporary, 'checkout')
  const shortAlias = path.join(temporary, 'short')
  const longAlias = path.join(temporary, 'long')
  const symlinkType = process.platform === 'win32' ? 'junction' : 'dir'
  const originalPlatform = process.platform
  mkdirSync(checkout)
  symlinkSync(checkout, shortAlias, symlinkType)
  symlinkSync(checkout, longAlias, symlinkType)
  const shortRoot = resolveToolRoot(shortAlias, 'win32')
  const longRoot = resolveToolRoot(longAlias, 'win32')
  const shortBin = path.join(shortRoot, '.cache', 'bin')
  const longBin = path.join(longRoot, '.cache', 'bin')
  const cache = path.join(shortRoot, '.cache', 'external-tools')
  const node = path.join(shortBin, 'node.exe')
  const firewall = path.join(temporary, 'sfw.exe')
  const npm = path.join(cache, 'npm-cli.js')
  mkdirSync(shortBin, { recursive: true })
  mkdirSync(cache, { recursive: true })
  writeFileSync(node, 'node placeholder')
  writeFileSync(firewall, 'firewall placeholder')
  Object.defineProperty(process, 'platform', { value: 'win32' })
  try {
    const pnpm = toolExecutable('pnpm')
    const npmLauncher = writeFirewallShim(
      'npm',
      firewall,
      { executable: realpathSync.native(node), args: [npm] },
      shortBin,
    )
    const pnpmLauncher = writeFirewallShim(
      'pnpm',
      firewall,
      { executable: pnpm },
      shortBin,
    )
    const npmBytes = readFileSync(npmLauncher)
    const pnpmBytes = readFileSync(pnpmLauncher)
    writeFirewallShim(
      'npm',
      firewall,
      { executable: realpathSync.native(node), args: [npm] },
      longBin,
    )
    writeFirewallShim('pnpm', firewall, { executable: pnpm }, longBin)
    expect(readFileSync(path.join(longBin, 'npm.cmd'))).toEqual(npmBytes)
    expect(readFileSync(path.join(longBin, 'pnpm.cmd'))).toEqual(pnpmBytes)
    expect(verifiedWrapper('npm', shortBin, firewall, npm)).toBe(true)
    expect(verifiedWrapper('pnpm', shortBin, firewall)).toBe(true)

    const npmPath = path.join(shortBin, 'npm.cmd')
    writeFileSync(
      npmPath,
      npmBytes.toString('utf8').replace('goto :missing', 'goto :edited'),
    )
    expect(verifiedWrapper('npm', shortBin, firewall, npm)).toBe(false)
    const pnpmPath = path.join(shortBin, 'pnpm.cmd')
    writeFileSync(
      pnpmPath,
      pnpmBytes.toString('utf8').replace(pnpm, `${pnpm}.edited`),
    )
    expect(verifiedWrapper('pnpm', shortBin, firewall)).toBe(false)
  } finally {
    Object.defineProperty(process, 'platform', { value: originalPlatform })
    rmSync(temporary, { recursive: true, force: true })
  }
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
