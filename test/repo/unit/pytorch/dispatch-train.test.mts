import path from 'node:path'
import assert from 'node:assert/strict'
import { expect, test, vi } from 'vitest'
const state = vi.hoisted(() => ({ checked: vi.fn() }))
vi.mock('../../../../scripts/repo/lib/command.mts', () => ({
  checked: state.checked,
}))
import {
  dispatchTrainingCommand,
  runDispatchTraining,
} from '../../../../scripts/repo/pytorch/dispatch-train.mts'
import { REPO_ROOT } from '../../../../scripts/repo/lib/paths.mts'
import { invokeMainModule } from '../bench/main-module.mts'

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

test('training runs in the pinned project and preserves the tool cache environment', async () => {
  state.checked.mockClear()
  runDispatchTraining(['--help'])
  const invocation = state.checked.mock.calls[0]!
  assert.deepEqual(invocation.slice(0, 2), [
    dispatchTrainingCommand(['--help']).command,
    dispatchTrainingCommand(['--help']).args,
  ])
  assert.equal(invocation[2].cwd, REPO_ROOT)
  assert.equal(invocation[2].interactive, true)
  assert.equal(
    invocation[2].env.UV_CACHE_DIR,
    path.join(REPO_ROOT, '.cache/uv'),
  )
  await invokeMainModule(
    () => import('../../../../scripts/repo/pytorch/dispatch-train.mts'),
    ['--input', 'fixture'],
    '/pytorch/dispatch-train.mts',
  )
  assert.deepEqual(state.checked.mock.calls[1]![1].slice(-2), [
    '--input',
    'fixture',
  ])
  const failure = Object.assign(new Error('tool failure'), {
    code: 'TOOL_FAILED',
  })
  state.checked.mockImplementationOnce(() => {
    throw failure
  })
  assert.throws(() => runDispatchTraining([]), { code: 'TOOL_FAILED' })
})
