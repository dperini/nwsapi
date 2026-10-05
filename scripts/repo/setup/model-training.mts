import path from 'node:path'
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

if (isMainModule(import.meta.url)) {
  await setupModelTraining()
}
