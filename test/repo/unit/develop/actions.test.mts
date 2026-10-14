import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  managedNpmWrapper,
  taskCommandArgs,
  TASKS,
  taskInstructions,
} from '../../../../scripts/develop/actions.mts'

test('setup and diagnostics expose direct Node commands', () => {
  assert.deepEqual(taskCommandArgs(TASKS[0]!), [
    'node',
    'scripts/setup.mjs',
  ])
  const diagnostics = TASKS.find(task => task.script === 'setup:check')!
  assert.deepEqual(taskCommandArgs(diagnostics), [
    'node',
    'scripts/develop/doctor.mts',
  ])
  assert.match(taskInstructions(diagnostics), /node scripts\/develop\/doctor\.mts/)
})

test('package script commands stay on the checkout managed npm wrapper', () => {
  const review = TASKS.find(task => task.script === 'review')!
  assert.deepEqual(taskCommandArgs(review), [
    managedNpmWrapper(),
    'run',
    'review',
  ])
  assert.equal(
    managedNpmWrapper(),
    process.platform === 'win32' ? '.cache\\bin\\npm.cmd' : '.cache/bin/npm',
  )
})
