import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { isMainModule } from '../../lib/run-node.mts'

type Manager = 'npm' | 'pnpm'
type Phase = 'bootstrap' | 'install-manager' | 'journey'

const REPO_ROOT = path.resolve(
  fileURLToPath(new URL('../../../../', import.meta.url)),
)
const TOOLS = JSON.parse(
  readFileSync(path.join(REPO_ROOT, '.config/external-tools.json'), 'utf8'),
) as { tools: Record<Manager, { version: string }> }

interface Invocation {
  command: string
  args: string[]
}

function managerFrom(value: string | undefined): Manager {
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
): Invocation {
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
  const manager = managerFrom(managerName)
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
) {
  const invocation = onboardingInvocation(
    phase,
    env['ENTRY_MANAGER'],
    process.execPath,
    env['RUNNER_TEMP'],
  )
  const result = execute(invocation.command, invocation.args)
  if (result !== 0) {
    process.exitCode = result ?? 1
  }
}

function executeCommand(command: string, args: string[]) {
  const result = spawnSync(command, args, {
    cwd: REPO_ROOT,
    env: process.env,
    shell: process.platform === 'win32',
    stdio: 'inherit',
  })
  if (result.error) {
    throw result.error
  }
  return result.status
}

if (isMainModule(import.meta.url)) {
  const phase = process.argv[2] as Phase | undefined
  if (
    phase !== 'bootstrap' &&
    phase !== 'install-manager' &&
    phase !== 'journey'
  ) {
    throw new Error('Choose bootstrap, install-manager, or journey.')
  }
  runOnboardingPhase(phase)
}
