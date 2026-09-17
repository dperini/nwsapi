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
} from '../../../../scripts/repo/security/run.mts'
import type { CommandRunner } from '../../../../scripts/repo/lib/command.mts'

test('security findings fail closed and severity matching ignores case', () => {
  expect(
    blockingFindings({ findings: [{ severity: 'HIGH' }, { severity: 'low' }] }),
  ).toHaveLength(1)
  expect(() => blockingFindings({})).toThrow('findings')
})

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
