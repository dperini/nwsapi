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
} from '../../../../scripts/repo/setup/security.mts'
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
