import { expect, test, vi } from 'vitest'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  agentSnapshot,
  blockingFindings,
  runSecurity,
  scanAgentConfiguration,
  skillDirectories,
  main,
} from '../../../../scripts/repo/security/run.mts'
import type * as Paths from '../../../../scripts/repo/lib/paths.mts'
import type { CommandRunner } from '../../../../scripts/repo/lib/command.mts'

test('security findings fail closed and severity matching ignores case', () => {
  expect(
    blockingFindings({ findings: [{ severity: 'HIGH' }, { severity: 'low' }] }),
  ).toHaveLength(1)
  expect(() => blockingFindings({})).toThrow('findings')
})

test('missing severity is nonblocking and a failed scanner never passes', () => {
  expect(blockingFindings({ findings: [{}] })).toEqual([])
  const root = mkdtempSync(path.join(os.tmpdir(), 'nwsapi-security-failed-'))
  try {
    const run: CommandRunner = command =>
      command === 'git'
        ? { status: 0, stdout: '', stderr: '' }
        : { status: 2, stdout: '', stderr: 'failed' }
    expect(() => scanAgentConfiguration(root, run)).toThrow()
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('CLI handles help and invalid arguments before accessing scanners', () => {
  vi.spyOn(console, 'log').mockImplementation(() => {})
  expect(() => main(['--help'])).not.toThrow()
  expect(() => main(['invalid'])).toThrow()
})
test.each([false, true])(
  'CLI requires local scanners and reports validated scan status %s',
  async available => {
    const root = mkdtempSync(path.join(os.tmpdir(), 'nwsapi-security-cli-'))
    const actual = await vi.importActual<typeof Paths>(
      '../../../../scripts/repo/lib/paths.mts',
    )
    vi.resetModules()
    vi.doMock('../../../../scripts/repo/lib/paths.mts', () => ({
      ...actual,
      REPO_ROOT: root,
    }))
    vi.doMock('../../../../scripts/repo/lib/command.mts', () => ({
      checked: (command: string) => (command === 'git' ? '' : ''),
      execute: () => ({ status: 0, stdout: '{"findings":[]}', stderr: '' }),
    }))
    vi.doMock('../../../../scripts/repo/lib/run-node.mts', () => ({
      isMainModule: (url: string) => url.endsWith('/security/run.mts'),
    }))
    const scanner = path.join(
      root,
      '.cache/security/python/cisco-ai-skill-scanner/bin/skill-scanner',
    )
    if (available) {
      mkdirSync(path.dirname(scanner), { recursive: true })
      writeFileSync(scanner, '')
      const pkg = path.join(root, 'node_modules/ecc-agentshield/package.json')
      mkdirSync(path.dirname(pkg), { recursive: true })
      writeFileSync(pkg, '{"version":"1"}')
    }
    const argv = process.argv
    process.argv = ['node', 'run.mts']
    vi.spyOn(console, 'log').mockImplementation(() => {})
    try {
      if (available) {
        await expect(
          import('../../../../scripts/repo/security/run.mts'),
        ).resolves.toBeDefined()
      } else {
        await expect(
          import('../../../../scripts/repo/security/run.mts'),
        ).rejects.toThrow()
      }
    } finally {
      process.argv = argv
      rmSync(root, { recursive: true, force: true })
      vi.doUnmock('../../../../scripts/repo/lib/paths.mts')
      vi.doUnmock('../../../../scripts/repo/lib/command.mts')
      vi.doUnmock('../../../../scripts/repo/lib/run-node.mts')
    }
  },
)

test('agent scans use Git-selected files, persist reports and remove temporary snapshots', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'nwsapi-security-audit-'))
  try {
    writeFileSync(path.join(root, 'AGENTS.md'), 'Contributor instructions.')
    mkdirSync(path.join(root, '.claude/skills/example'), { recursive: true })
    writeFileSync(
      path.join(root, '.claude/skills/example/SKILL.md'),
      'Skill fixture.',
    )
    let snapshot = ''
    const run = vi.fn<CommandRunner>((command, args) => {
      if (command === 'git') {
        return { status: 0, stdout: 'AGENTS.md\0', stderr: '' }
      }
      if (args.includes('scan') && args.includes('--path')) {
        snapshot = args[args.indexOf('--path') + 1]!
        expect(readFileSync(path.join(snapshot, 'AGENTS.md'), 'utf8')).toBe(
          'Contributor instructions.',
        )
        expect(existsSync(path.join(snapshot, '.claude'))).toBe(false)
      }
      return { status: 0, stdout: JSON.stringify({ findings: [] }), stderr: '' }
    })
    expect(skillDirectories(root)).toHaveLength(1)
    expect(runSecurity(root, run)).toEqual({
      agentshield: true,
      workflows: true,
      skills: 1,
    })
    expect(existsSync(snapshot)).toBe(false)
    expect(
      JSON.parse(
        readFileSync(
          path.join(root, '.cache/security/reports/agentshield.json'),
          'utf8',
        ),
      ),
    ).toEqual({ findings: [] })
    const blocking: CommandRunner = (command, args, options) =>
      command === 'git'
        ? run(command, args, options)
        : {
            status: 1,
            stdout: JSON.stringify({ findings: [{ severity: 'medium' }] }),
            stderr: '',
          }
    expect(() => scanAgentConfiguration(root, blocking)).toThrow('medium')
    symlinkSync(os.tmpdir(), path.join(root, 'outside'))
    expect(() =>
      agentSnapshot(root, () => ({
        status: 0,
        stdout: 'outside\0',
        stderr: '',
      })),
    ).toThrow('leaves')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
