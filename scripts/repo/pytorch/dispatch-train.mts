import path from 'node:path'
import manifest from '../../../.config/external-tools.json' with { type: 'json' }
import { checked } from '../lib/command.mts'
import { REPO_ROOT } from '../lib/paths.mts'
import { isMainModule } from '../lib/run-node.mts'

export function dispatchTrainingCommand(args: string[]) {
  const project = path.join(REPO_ROOT, manifest.tools.pytorch.project)
  return {
    command: path.join(REPO_ROOT, '.cache/bin/uv'),
    args: [
      'run',
      '--project',
      project,
      '--locked',
      'python',
      'scripts/repo/pytorch/dispatch_train.py',
      ...args,
    ],
  }
}

export function runDispatchTraining(args: string[]) {
  const invocation = dispatchTrainingCommand(args)
  checked(invocation.command, invocation.args, {
    cwd: REPO_ROOT,
    env: {
      ...process.env,
      UV_CACHE_DIR: path.join(REPO_ROOT, '.cache/uv'),
    },
    interactive: true,
  })
}

if (isMainModule(import.meta.url)) {
  runDispatchTraining(process.argv.slice(2))
}
