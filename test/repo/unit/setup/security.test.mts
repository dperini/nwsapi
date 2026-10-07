import { expect, test, vi } from 'vitest'
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import manifest from '../../../../.config/external-tools.json' with { type: 'json' }
import {
  installSkillScanner,
  installSkillSpector,
  scannerExecutable,
  scannerWheel,
  securityEnvironment,
  securityTools,
  setupSecurity,
  SECURITY_OPERATIONS,
  main,
} from '../../../../scripts/repo/setup/security.mts'
import type * as Paths from '../../../../scripts/repo/lib/paths.mts'
import type * as Tools from '../../../../scripts/repo/setup/tools.mts'
import type * as Download from '../../../../scripts/repo/setup/download.mts'
import type { CommandRunner } from '../../../../scripts/repo/lib/command.mts'

test('security plans use platform-pinned wheels and repository-local Python environments', () => {
  expect(securityTools()).toEqual(['uv', 'zizmor', 'actionlint'])
  expect(securityTools(true)).toContain('trufflehog')
  expect(securityEnvironment('/fixture').UV_TOOL_DIR).toBe(
    '/fixture/.cache/security/python',
  )
  expect(scannerExecutable('/fixture')).toContain(
    '/fixture/.cache/security/python/',
  )
  for (const platform of Object.keys(
    manifest.tools['skill-scanner'].platforms,
  )) {
    expect(scannerWheel(platform).asset).toMatch(
      /^https:\/\/files.pythonhosted.org\//,
    )
  }
  expect(() => scannerWheel('unknown')).toThrow('No verified')
})

test('verified scanner bytes and locked SkillSpector sources are installed before activation', async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'nwsapi-security-setup-'))
  try {
    const activate = vi.fn()
    const download = vi.fn(async () => Buffer.from('verified wheel'))
    const run = vi.fn<CommandRunner>((_command, args) => ({
      status: 0,
      stdout: args.includes('--version')
        ? manifest.tools['skill-scanner'].version
        : '',
      stderr: '',
    }))
    await installSkillScanner(run, root, download, activate)
    expect(download).toHaveBeenCalledWith(
      scannerWheel().asset,
      scannerWheel().integrity,
      path.join(root, '.cache/external-tools/archives'),
    )
    expect(
      readFileSync(
        path.join(
          root,
          '.cache/external-tools/wheels',
          scannerWheel().filename,
        ),
        'utf8',
      ),
    ).toBe('verified wheel')
    expect(run.mock.calls[0]?.[1]).toContain('--exclude-newer')
    expect(activate.mock.calls[0]?.[0]).toBe('skill-scanner')
    const project = path.join(root, manifest.tools.skillspector.project)
    mkdirSync(project, { recursive: true })
    const lock = path.join(project, 'uv.lock')
    writeFileSync(lock, 'invalid pin')
    expect(() => installSkillSpector(run, root, activate)).toThrow(
      'pinned commit',
    )
    writeFileSync(
      lock,
      `source = "git+https://github.com/NVIDIA/skillspector#${manifest.tools.skillspector.version}"`,
    )
    const executable = path.join(
      root,
      '.cache/security/skillspector',
      process.platform === 'win32'
        ? 'Scripts/skillspector.exe'
        : 'bin/skillspector',
    )
    mkdirSync(path.dirname(executable), { recursive: true })
    writeFileSync(executable, '')
    expect(installSkillSpector(run, root, activate)).toBe(executable)
    expect(run.mock.calls.at(-1)?.[1]).toContain('--locked')
    expect(activate.mock.calls.at(-1)?.[0]).toBe('skillspector')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('ordinary setup installs the default scanners and all mode adds optional tools', async () => {
  const operations = {
    ...SECURITY_OPERATIONS,
    installTool: vi.fn(async () => '/tool'),
    checked: vi.fn(() => 'version'),
    activateTool: vi.fn(),
    installSkillScanner: vi.fn(async () => '/scanner'),
    installSkillSpector: vi.fn(() => '/spector'),
  }
  await setupSecurity(false, operations)
  expect(operations.installTool).toHaveBeenCalledTimes(3)
  expect(operations.installSkillScanner).toHaveBeenCalledOnce()
  expect(operations.installSkillSpector).not.toHaveBeenCalled()
  await setupSecurity(true, operations)
  expect(operations.installSkillSpector).toHaveBeenCalledOnce()
})

test('scanner rejects an unverified reported version before activation', async t => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'nwsapi-scanner-version-'))
  t.onTestFinished(() => rmSync(root, { recursive: true, force: true }))
  const activate = vi.fn()
  await expect(
    installSkillScanner(
      () => ({ status: 0, stdout: 'other version', stderr: '' }),
      root,
      async () => Buffer.from('wheel'),
      activate,
    ),
  ).rejects.toThrow()
  expect(activate).not.toHaveBeenCalled()
})
test('SkillSpector requires its installed executable and handles Windows layouts', t => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'nwsapi-spector-windows-'))
  t.onTestFinished(() => rmSync(root, { recursive: true, force: true }))
  const project = path.join(root, manifest.tools.skillspector.project)
  mkdirSync(project, { recursive: true })
  writeFileSync(
    path.join(project, 'uv.lock'),
    `#${manifest.tools.skillspector.version}`,
  )
  const run: CommandRunner = () => ({ status: 0, stdout: '', stderr: '' })
  expect(() => installSkillSpector(run, root, vi.fn())).toThrow()
  const original = process.platform
  Object.defineProperty(process, 'platform', { value: 'win32' })
  try {
    expect(scannerExecutable(root)).toContain('Scripts/skill-scanner.exe')
    const executable = path.join(
      root,
      '.cache/security/skillspector/Scripts/skillspector.exe',
    )
    mkdirSync(path.dirname(executable), { recursive: true })
    writeFileSync(executable, '')
    expect(installSkillSpector(run, root, vi.fn())).toBe(executable)
  } finally {
    Object.defineProperty(process, 'platform', { value: original })
  }
})
test('CLI handles help and rejects unknown options', async () => {
  vi.spyOn(console, 'log').mockImplementation(() => {})
  await expect(main(['--help'])).resolves.toBeUndefined()
  await expect(main(['unknown'])).rejects.toThrow()
})
test('CLI installs through mocked verified tool operations', async t => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'nwsapi-security-setup-cli-'))
  t.onTestFinished(() => rmSync(root, { recursive: true, force: true }))
  const paths = await vi.importActual<typeof Paths>(
    '../../../../scripts/repo/lib/paths.mts',
  )
  const tools = await vi.importActual<typeof Tools>(
    '../../../../scripts/repo/setup/tools.mts',
  )
  const download = await vi.importActual<typeof Download>(
    '../../../../scripts/repo/setup/download.mts',
  )
  vi.resetModules()
  vi.doMock('../../../../scripts/repo/lib/paths.mts', () => ({
    ...paths,
    REPO_ROOT: root,
  }))
  vi.doMock('../../../../scripts/repo/lib/run-node.mts', () => ({
    isMainModule: (url: string) => url.endsWith('/setup/security.mts'),
  }))
  vi.doMock('../../../../scripts/repo/lib/command.mts', () => ({
    checked: () => manifest.tools['skill-scanner'].version,
    execute: () => ({ status: 0, stdout: '', stderr: '' }),
  }))
  vi.doMock('../../../../scripts/repo/setup/tools.mts', () => ({
    ...tools,
    activateTool: vi.fn(),
  }))
  vi.doMock('../../../../scripts/repo/setup/install.mts', () => ({
    installTool: async () => '/tool',
  }))
  vi.doMock('../../../../scripts/repo/setup/download.mts', () => ({
    ...download,
    downloadArchive: async () => Buffer.from('verified wheel'),
  }))
  const argv = process.argv
  process.argv = ['node', 'security.mts']
  try {
    await expect(
      import('../../../../scripts/repo/setup/security.mts'),
    ).resolves.toBeDefined()
  } finally {
    process.argv = argv
    vi.doUnmock('../../../../scripts/repo/lib/paths.mts')
    vi.doUnmock('../../../../scripts/repo/lib/run-node.mts')
    vi.doUnmock('../../../../scripts/repo/lib/command.mts')
    vi.doUnmock('../../../../scripts/repo/setup/tools.mts')
    vi.doUnmock('../../../../scripts/repo/setup/install.mts')
    vi.doUnmock('../../../../scripts/repo/setup/download.mts')
  }
})
test('wheel URL must use the exact verified host and artifact name', async () => {
  vi.resetModules()
  const invalid = structuredClone(manifest)
  const platforms = invalid.tools['skill-scanner'].platforms as Record<
    string,
    { asset: string; integrity: string }
  >
  platforms['fixture'] = {
    asset: 'https://other.example/scanner.whl',
    integrity: 'invalid',
  }
  vi.doMock('../../../../.config/external-tools.json', () => ({
    default: invalid,
  }))
  try {
    const module = await import('../../../../scripts/repo/setup/security.mts')
    expect(() => module.scannerWheel('fixture')).toThrow()
  } finally {
    vi.doUnmock('../../../../.config/external-tools.json')
  }
})
