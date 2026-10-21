import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { parseArgs } from 'node:util'
import { REPO_ROOT } from '../lib/paths.mts'
import { isMainModule } from '../lib/run-node.mts'
import { ensureManagedTools, managedEnvironment } from './manager.mts'
import { buildRequiredFiles } from './build.mts'
import { editorFiles } from './editor.mts'

type Run = (
  command: string,
  args: string[],
  env: NodeJS.ProcessEnv,
) => { status: number | null; signal: NodeJS.Signals | null; error?: Error }

export async function prepareCheckout(
  ensure = ensureManagedTools,
  run: Run = (command, args, env) =>
    spawnSync(command, args, {
      cwd: REPO_ROOT,
      env,
      stdio: 'inherit',
    }),
) {
  try {
    const tools = await ensure()
    const node = path.join(
      tools,
      process.platform === 'win32' ? 'node.exe' : 'node',
    )
    for (const script of [
      'scripts/repo/setup/agents.mts',
      'scripts/repo/setup/editor.mts',
      'scripts/repo/setup/hooks.mts',
      'scripts/repo/video/prepare.mts',
      'scripts/repo/build/run.mts',
    ]) {
      const args = script.endsWith('agents.mts')
        ? [script, '--optional']
        : [script]
      const result = run(node, args, managedEnvironment(tools))
      if (result.error) {
        throw result.error
      }
      if (result.status !== 0 || result.signal) {
        throw new Error(`Preparation failed while running ${script}.`)
      }
    }
  } catch (error) {
    console.error(
      `Preparation failed: ${error instanceof Error ? error.message : String(error)}`,
    )
    console.error('Retry: node scripts/repo/setup/prepare.mts')
    process.exitCode = 1
  }
}

export function preparePlan(root = REPO_ROOT) {
  const editor = editorFiles(process.platform, process.arch)
  return {
    schemaVersion: 1,
    type: 'preview',
    command: 'setup/prepare',
    steps: [
      'Verify or install managed checkout tools.',
      'Configure the pinned TypeScript editor service and refresh agent aliases and Git hooks.',
      'Verify the pinned fframes source.',
      'Build missing package outputs.',
    ],
    targets: [
      path.join(root, '.cache/bin'),
      path.join(root, '.cache/external-tools'),
      path.join(root, '.agents/skills'),
      ...editor.files.map(file => path.join(root, file.relative)),
      ...editor.launchers.map(file => path.join(root, file.relative)),
      gitHooksTarget(root),
      path.join(root, '.cache/fframes'),
      ...buildRequiredFiles().map(file => path.join(root, file.output)),
    ],
  }
}

export function gitHooksTarget(root = REPO_ROOT) {
  const result = spawnSync('git', ['rev-parse', '--git-path', 'hooks'], {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  })
  return result.status === 0 && result.stdout
    ? path.resolve(root, result.stdout.trim())
    : path.join(root, '.git/hooks')
}

export function describePrepare() {
  return {
    schemaVersion: 1,
    type: 'command',
    name: 'setup/prepare',
    description:
      'Prepare checkout tools, agent aliases, hooks, and build outputs.',
    options: ['--json', '--describe', '--dry-run'],
    mutates: true,
  }
}

export async function main(args = process.argv.slice(2)) {
  const { values } = parseArgs({
    args: args[0] === '--' ? args.slice(1) : args,
    options: {
      help: { type: 'boolean', short: 'h' },
      json: { type: 'boolean' },
      describe: { type: 'boolean' },
      'dry-run': { type: 'boolean' },
    },
  })
  if (values.help) {
    console.log('Usage: node scripts/repo/setup/prepare.mts [--dry-run]')
    return
  }
  if (values.describe) {
    const description = describePrepare()
    console.log(
      values.json ? JSON.stringify(description) : description.description,
    )
    return
  }
  if (values['dry-run']) {
    const plan = preparePlan()
    console.log(values.json ? JSON.stringify(plan) : formatPreparePlan(plan))
    return
  }
  await prepareCheckout()
}

export function formatPreparePlan(plan: ReturnType<typeof preparePlan>) {
  return [
    'Would prepare this checkout:',
    ...plan.steps.map(step => `  ${step}`),
    'Targets:',
    ...plan.targets.map(target => `  ${target}`),
  ].join('\n')
}

if (isMainModule(import.meta.url)) {
  await main()
}
