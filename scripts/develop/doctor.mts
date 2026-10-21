import { isMainModule } from '../lib/paths.mts'
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { parseArgs } from 'node:util'
import {
  REPO_ROOT,
  TOOL_BIN,
  TOOLCHAIN_STATE,
  toolExecutable,
  toolVersion,
  toolchainState,
} from '../lib/external-tools.mjs'
import { managedEnvironment } from '../lib/tools/setup.mjs'
import { activeTool, dependencyReport } from './diagnostics.mts'

const toolNames = ['node', 'npm', 'nub', 'mise']

export interface DoctorOptions {
  repoRoot?: string
  toolBin?: string
  statePath?: string
  log?: (message: string) => void
  env?: NodeJS.ProcessEnv
}

export function doctorNextCommand(ready: boolean) {
  return ready
    ? 'node scripts/develop/run.mts'
    : 'node scripts/setup.mjs'
}

export function doctorReport({
  repoRoot = REPO_ROOT,
  toolBin = TOOL_BIN,
  statePath = TOOLCHAIN_STATE,
  log = console.log,
  env = process.env,
}: DoctorOptions = {}) {
  const nodePath = path.join(
    toolBin,
    process.platform === 'win32' ? 'node.exe' : 'node',
  )
  let stateCurrent = false
  try {
    const stored = JSON.parse(readFileSync(statePath, 'utf8'))
    stateCurrent = JSON.stringify(stored) === toolchainState()
  } catch {
    stateCurrent = false
  }

  const toolChecks = toolNames.map(name => {
    let actual = 'not installed'
    const executable = name === 'node' ? nodePath : toolExecutable(name)
    if (stateCurrent && existsSync(executable) && existsSync(nodePath)) {
      try {
        const args =
          name === 'node'
            ? ['--version']
            : name === 'npm'
              ? [executable, '--version']
              : ['--version']
        const command =
          name === 'node' || name === 'npm' ? nodePath : executable
        const version = execFileSync(command, args, {
          cwd: repoRoot,
          env: managedEnvironment(),
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'ignore'],
          timeout: 5000,
          killSignal: 'SIGKILL',
        })
          .trim()
          .split(' ')[0]
          .replace(/^v/, '')
        actual = version
      } catch {
        actual = 'could not run'
      }
    }
    return { name, executable, actual, ready: actual === toolVersion(name) }
  })

  const dependencies = dependencyReport(repoRoot)
  const dependenciesReady = dependencies.ready
  const activeTools = ['node', 'npm'].map(name =>
    activeTool(name, repoRoot, toolBin, env),
  )
  const toolsReady = stateCurrent && toolChecks.every(tool => tool.ready)
  const ready = toolsReady && dependenciesReady
  log(`Pinned checkout tools: ${toolsReady ? 'ready' : 'needs setup'}`)
  for (const tool of toolChecks) {
    log(
      `${tool.name}: ${tool.ready ? tool.actual : `expected ${toolVersion(tool.name)}, found ${tool.actual}`}`,
    )
  }
  log(
    `Direct dependencies: ${dependenciesReady ? 'match lockfile' : 'need setup'}`,
  )
  for (const issue of dependencies.issues) {
    log(`  ${issue}`)
  }
  for (const tool of activeTools) {
    log(`Active ${tool.name}: ${tool.version ?? 'unavailable'} (${tool.owner})`)
  }
  log(
    'Repository tasks use the pinned checkout tools. External tool defaults are preserved.',
  )
  log(`Next command: ${doctorNextCommand(ready)}`)
  return {
    ready,
    stateCurrent,
    dependenciesReady,
    dependencies,
    toolChecks,
    activeTools,
    nodePath,
  }
}

export function main(
  args = process.argv.slice(2),
  options: DoctorOptions = {},
) {
  const { values } = parseArgs({
    args,
    options: { details: { type: 'boolean' } },
  })
  const report = doctorReport(options)
  if (values.details) {
    const log = options.log ?? console.log
    log(`Tool directory: ${options.toolBin ?? TOOL_BIN}`)
    log(`Toolchain state: ${options.statePath ?? TOOLCHAIN_STATE}`)
    for (const tool of report.activeTools) {
      log(`${tool.name} PATH entry: ${tool.pathEntry ?? 'none'}`)
      log(`  executable: ${tool.executable ?? 'not found'}`)
      log(`  resolved: ${tool.resolved ?? 'not found'}`)
      log(`  owner (inferred): ${tool.owner}`)
    }
    log(
      'PATH resolution does not inspect shell aliases, functions, or wrapper contents.',
    )
    for (const tool of report.toolChecks) {
      log(`${tool.name} executable: ${tool.executable}`)
    }
  }
  return report.ready ? 0 : 1
}

if (isMainModule(import.meta.url)) {
  process.exitCode = main()
}
