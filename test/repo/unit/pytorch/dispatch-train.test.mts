import path from 'node:path'
import { expect, test } from 'vitest'
import { dispatchTrainingCommand } from '../../../../scripts/repo/pytorch/dispatch-train.mts'
import { REPO_ROOT } from '../../../../scripts/repo/lib/paths.mts'

test('dispatch training uses the pinned uv project and forwards arguments', () => {
  const invocation = dispatchTrainingCommand([
    '--input',
    'collection',
    '--output',
    'model',
  ])
  expect(invocation).toEqual({
    command: path.join(REPO_ROOT, '.cache/bin/uv'),
    args: [
      'run',
      '--project',
      path.join(REPO_ROOT, '.config/model-training'),
      '--locked',
      'python',
      'scripts/repo/pytorch/dispatch_train.py',
      '--input',
      'collection',
      '--output',
      'model',
    ],
  })
})
