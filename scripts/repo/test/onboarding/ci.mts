import { spawnSync } from 'node:child_process'
import type { SpawnSyncOptions } from 'node:child_process'
import { readFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import { isMainModule } from '../../lib/run-node.mts'

export type OnboardingManager = 'npm' | 'pnpm'
export type OnboardingPhase = 'bootstrap' | 'install-manager' | 'journey'

const REPO_ROOT = path.resolve(
  fileURLToPath(new URL('../../../../', import.meta.url)),
)
const TOOLS = JSON.parse(
  readFileSync(path.join(REPO_ROOT, '.config/external-tools.json'), 'utf8'),
) as { tools: Record<OnboardingManager, { version: string }> }

export interface OnboardingInvocation {
  command: string
  args: string[]
}

export function onboardingPhasePlan(
  phase: string,
  env = process.env,
  node = process.execPath,
  temporary = env['RUNNER_TEMP'] ?? os.tmpdir(),
  root = REPO_ROOT,
) {
  const invocation = onboardingInvocation(
    phase,
    env['ENTRY_MANAGER'],
    node,
    temporary,
    root,
  )
  return {
    schemaVersion: 1,
    type: 'preview',
    command: `onboarding/${phase}`,
    root,
    invocation,
    targets: [
      path.join(temporary, 'onboarding-manager'),
      path.join(temporary, 'nwsapi-onboarding-*'),
      path.join(root, '.cache/onboarding'),
    ],
  }
}

export function describeOnboarding() {
  return {
    schemaVersion: 1,
    type: 'command',
    name: 'onboarding',
    description:
      'Run an isolated bootstrap, package-manager install, or contributor journey.',
    phases: ['bootstrap', 'install-manager', 'journey'],
    options: ['--json', '--describe', '--dry-run'],
    mutates: true,
  }
}

export type OnboardingExecutor = (
  command: string,
  args: string[],
  options: SpawnSyncOptions,
) => { status: number | null; error?: Error }

export function parseEntryManager(
  value: string | undefined,
): OnboardingManager {
  if (value === 'npm' || value === 'pnpm') {
    return value
  }
  throw new Error('Set ENTRY_MANAGER to npm or pnpm.')
}

export function onboardingInvocation(
  phase: string,
  managerName: string | undefined,
  node = process.execPath,
  temporary = process.env['RUNNER_TEMP'] ?? os.tmpdir(),
  root = REPO_ROOT,
): OnboardingInvocation {
  if (phase === 'bootstrap') {
    return {
      command: node,
      args: [
        path.join(root, 'scripts/repo/test/onboarding/run.mts'),
        '--scenario',
        'bootstrap',
        '--node',
        node,
      ],
    }
  }
  const manager = parseEntryManager(managerName)
  const managerRoot = path.join(temporary, 'onboarding-manager')
  if (phase === 'install-manager') {
    return {
      command: 'npm',
      args: [
        'install',
        '--prefix',
        managerRoot,
        '--no-save',
        `${manager}@${TOOLS.tools[manager].version}`,
      ],
    }
  }
  if (phase !== 'journey') {
    throw new Error(`Unknown onboarding phase: ${phase}.`)
  }
  const entry = path.join(
    managerRoot,
    'node_modules',
    manager,
    manager === 'npm' ? 'bin/npm-cli.js' : 'bin/pnpm.mjs',
  )
  return {
    command: node,
    args: [
      path.join(root, 'scripts/repo/test/onboarding/run.mts'),
      '--scenario',
      manager,
      '--node',
      node,
      `--${manager}`,
      entry,
    ],
  }
}

export function runOnboardingPhase(
  phase: string,
  env = process.env,
  execute = executeCommand,
  json = false,
) {
  const invocation = onboardingInvocation(
    phase,
    env['ENTRY_MANAGER'],
    process.execPath,
    env['RUNNER_TEMP'],
  )
  const captured = json
    ? executeCommandCaptured(invocation.command, invocation.args)
    : undefined
  const result = captured
    ? undefined
    : execute(invocation.command, invocation.args)
  const status = captured?.status ?? result
  if (captured) {
    console.log(
      JSON.stringify({
        schemaVersion: 1,
        type: 'result',
        command: `onboarding/${phase}`,
        status: status === 0 ? 'completed' : 'failed',
        exitCode: status ?? 1,
        stdout: captured.stdout,
        stderr: captured.stderr,
      }),
    )
  }
  if (status !== 0) {
    process.exitCode = status ?? 1
  }
}

export function executeCommand(
  command: string,
  args: string[],
  platform = process.platform,
  execute: OnboardingExecutor = spawnSync,
) {
  const result = execute(command, args, {
    cwd: REPO_ROOT,
    env: process.env,
    shell: platform === 'win32' && command === 'npm',
    stdio: 'inherit',
  })
  if (result.error) {
    throw result.error
  }
  return result.status
}

export function executeCommandCaptured(command: string, args: string[]) {
  const result = spawnSync(command, args, {
    cwd: REPO_ROOT,
    env: process.env,
    shell: process.platform === 'win32' && command === 'npm',
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  if (result.error) {
    throw result.error
  }
  return {
    status: result.status,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  }
}

if (isMainModule(import.meta.url)) {
  const phase = process.argv[2] as OnboardingPhase | undefined
  if (
    phase !== 'bootstrap' &&
    phase !== 'install-manager' &&
    phase !== 'journey'
  ) {
    throw new Error('Choose bootstrap, install-manager, or journey.')
  }
  const { values } = parseArgs({
    args: process.argv.slice(3),
    options: {
      json: { type: 'boolean' },
      describe: { type: 'boolean' },
      'dry-run': { type: 'boolean' },
    },
  })
  if (values.describe) {
    console.log(
      values.json
        ? JSON.stringify(describeOnboarding())
        : 'onboarding: Run an isolated bootstrap, package-manager install, or contributor journey. Use --dry-run to preview commands and temporary paths.',
    )
  } else if (values['dry-run']) {
    const plan = onboardingPhasePlan(phase)
    console.log(values.json ? JSON.stringify(plan) : formatOnboardingPlan(plan))
  } else {
    runOnboardingPhase(phase, process.env, executeCommand, values.json)
  }
}

export function formatOnboardingPlan(
  plan: ReturnType<typeof onboardingPhasePlan>,
) {
  return [
    `Would run ${plan.command}:`,
    `  ${plan.invocation.command} ${plan.invocation.args.join(' ')}`,
    'Temporary and report paths:',
    ...plan.targets.map(target => `  ${target}`),
  ].join('\n')
}
