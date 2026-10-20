import path from 'node:path'
import { parseArgs } from 'node:util'
import { toolPlan } from '../external-tools.mts'
import { REPO_ROOT } from '../lib/paths.mts'
import { isMainModule } from '../lib/run-node.mts'
import { checked } from '../lib/command.mts'
import { installTool } from './install.mts'
import manifest from '../../../.config/external-tools.json' with { type: 'json' }

export async function setupModelTraining() {
  const uv = await installTool(toolPlan('uv'))
  const project = path.join(REPO_ROOT, manifest.tools.pytorch.project)
  const environment = {
    ...process.env,
    UV_CACHE_DIR: path.join(REPO_ROOT, '.cache/uv'),
  }
  checked(
    uv,
    [
      'sync',
      '--project',
      project,
      '--python',
      manifest.tools.pytorch.python,
      '--locked',
    ],
    { cwd: REPO_ROOT, env: environment, interactive: true },
  )
  const version = checked(
    uv,
    [
      'run',
      '--project',
      project,
      '--locked',
      'python',
      '-c',
      'import torch; print(torch.__version__)',
    ],
    { cwd: REPO_ROOT, env: environment },
  )
  if (version !== manifest.tools.pytorch.version) {
    throw new Error(
      `Expected PyTorch ${manifest.tools.pytorch.version}, received ${version}.`,
    )
  }
}

export function modelTrainingPlan(root = REPO_ROOT) {
  const project = path.join(root, manifest.tools.pytorch.project)
  return {
    schemaVersion: 1,
    type: 'preview',
    command: 'setup/model-training',
    steps: [
      `Install pinned uv ${manifest.tools.uv.version}.`,
      `Sync the locked Python ${manifest.tools.pytorch.python} project.`,
      `Verify PyTorch ${manifest.tools.pytorch.version}.`,
    ],
    targets: [
      path.join(root, '.cache/bin/uv'),
      path.join(root, '.cache/external-tools'),
      path.join(root, '.cache/uv'),
      path.join(project, '.venv'),
    ],
  }
}

export function describeModelTrainingSetup() {
  return {
    schemaVersion: 1,
    type: 'command',
    name: 'setup/model-training',
    description: 'Install the pinned Python environment for model training.',
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
    console.log('Usage: pnpm run setup:model-training [--dry-run]')
    return
  }
  if (values.describe) {
    const description = describeModelTrainingSetup()
    console.log(
      values.json ? JSON.stringify(description) : description.description,
    )
    return
  }
  if (values['dry-run']) {
    const plan = modelTrainingPlan()
    console.log(
      values.json ? JSON.stringify(plan) : formatModelTrainingPlan(plan),
    )
    return
  }
  await setupModelTraining()
}

export function formatModelTrainingPlan(
  plan: ReturnType<typeof modelTrainingPlan>,
) {
  return [
    'Would prepare the model-training environment:',
    ...plan.steps.map(step => `  ${step}`),
    'Targets:',
    ...plan.targets.map(target => `  ${target}`),
  ].join('\n')
}

if (isMainModule(import.meta.url)) {
  await main()
}
