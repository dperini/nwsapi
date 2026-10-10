import assert from 'node:assert/strict'
import { test } from 'node:test'
import { npmInvocation } from '../../../scripts/lib/npm.mjs'

test('setup launches npm independently of the invoking package manager', () => {
  assert.deepEqual(
    npmInvocation(['exec', 'playwright'], 'darwin', '/missing'),
    {
      command: 'npm',
      args: ['exec', 'playwright'],
      shell: false,
    },
  )
})

test('setup uses the Windows npm command shim', () => {
  assert.deepEqual(npmInvocation(['exec', 'playwright'], 'win32', '/missing'), {
    command: 'npm.cmd',
    args: ['exec', 'playwright'],
    shell: true,
  })
})
