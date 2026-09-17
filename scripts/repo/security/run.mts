import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { globSync } from 'node:fs'
import { toolExecutable } from '../external-tools.mts'
import { REPO_ROOT } from '../lib/paths.mts'
import { checked, execute } from '../lib/command.mts'
import type { CommandRunner } from '../lib/command.mts'
import { isMainModule } from '../lib/run-node.mts'
import { scannerExecutable, securityEnvironment } from '../setup/security.mts'

export interface SecurityFinding {
  severity?: string
  title?: string
  message?: string
}

export function blockingFindings(report: { findings?: SecurityFinding[] }) {
  if (!Array.isArray(report.findings)) {
    throw new Error('Security scanner did not return a findings array.')
  }
  return report.findings.filter(finding =>
    ['critical', 'high', 'medium'].includes(
      finding.severity?.toLowerCase() ?? '',
    ),
  )
}

export function skillDirectories(root = REPO_ROOT) {
  return globSync(
    ['.agents/skills/**/SKILL.md', '.claude/skills/**/SKILL.md'],
    { cwd: root },
  ).map(file => path.dirname(path.join(root, file)))
}

export function agentSnapshot(root = REPO_ROOT, run: CommandRunner = execute) {
  const files = checked(
    'git',
    [
      'ls-files',
      '-z',
      '--cached',
      '--others',
      '--exclude-standard',
      '--',
      '.claude',
      '.agents',
      '.mcp.json',
      'CLAUDE.md',
      'AGENTS.md',
    ],
    { cwd: root },
    run,
  )
    .split('\0')
    .filter(Boolean)
  const directory = mkdtempSync(path.join(os.tmpdir(), 'nwsapi-agent-audit-'))
  try {
    for (const file of files) {
      const source = realpathSync(path.join(root, file))
      if (!source.startsWith(realpathSync(root) + path.sep)) {
        throw new Error('Agent configuration leaves the repository.')
      }
      const target = path.join(directory, file)
      mkdirSync(path.dirname(target), { recursive: true })
      copyFileSync(source, target)
    }
    return directory
  } catch (error) {
    rmSync(directory, { recursive: true, force: true })
    throw error
  }
}

export function scanAgentConfiguration(
  root = REPO_ROOT,
  run: CommandRunner = execute,
) {
  const snapshot = agentSnapshot(root, run)
  try {
    const agentshield = path.join(
      root,
      'node_modules/ecc-agentshield/dist/index.js',
    )
    const result = run(
      process.execPath,
      [
        agentshield,
        'scan',
        '--path',
        snapshot,
        '--format',
        'json',
        '--min-severity',
        'medium',
      ],
      { cwd: root, env: securityEnvironment(root) },
    )
    if (result.status > 1) {
      throw new Error(`AgentShield failed: ${result.stderr}`)
    }
    const report = JSON.parse(result.stdout) as { findings?: SecurityFinding[] }
    const directory = path.join(root, '.cache/security/reports')
    mkdirSync(directory, { recursive: true })
    writeFileSync(
      path.join(directory, 'agentshield.json'),
      result.stdout + '\n',
    )
    if (blockingFindings(report).length || result.status !== 0) {
      throw new Error(
        'AgentShield reported medium or higher findings. Inspect .cache/security/reports/agentshield.json.',
      )
    }
  } finally {
    rmSync(snapshot, { recursive: true, force: true })
  }
}

export function runSecurity(root = REPO_ROOT, run: CommandRunner = execute) {
  const options = { cwd: root, env: securityEnvironment(root) }
  checked(
    toolExecutable('zizmor'),
    ['--offline', '--min-severity', 'medium', '.github'],
    { ...options, interactive: true },
    run,
  )
  checked(
    toolExecutable('actionlint'),
    ['-shellcheck=', ...globSync('.github/workflows/*.yml', { cwd: root })],
    { ...options, interactive: true },
    run,
  )
  scanAgentConfiguration(root, run)
  for (const skill of skillDirectories(root)) {
    checked(
      scannerExecutable(root),
      ['scan', skill, '--format', 'json', '--fail-on-severity', 'MEDIUM'],
      { ...options, interactive: true },
      run,
    )
  }
  return {
    agentshield: true,
    workflows: true,
    skills: skillDirectories(root).length,
  }
}

export function main(args = process.argv.slice(2)) {
  if (args.includes('--help') || args.includes('-h')) {
    console.log(
      'Usage: pnpm run security\nRuns actionlint, zizmor, AgentShield, and offline Skill Scanner checks.',
    )
    return
  }
  if (args.length) {
    throw new Error('Usage: pnpm run security')
  }
  if (!existsSync(scannerExecutable())) {
    throw new Error(
      'Security scanners are missing. Run pnpm run setup:security.',
    )
  }
  const pkg = JSON.parse(
    readFileSync(
      path.join(REPO_ROOT, 'node_modules/ecc-agentshield/package.json'),
      'utf8',
    ),
  ) as { version: string }
  console.log(`AgentShield ${pkg.version}`)
  console.log(JSON.stringify(runSecurity()))
}

if (isMainModule(import.meta.url)) {
  main()
}
