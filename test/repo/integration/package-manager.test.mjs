import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { test } from 'node:test'
import { invokedByNonNpm } from '../../../scripts/lib/package-manager.mjs'

test('recognizes npm and direct script execution', () => {
  assert.equal(invokedByNonNpm({ npm_config_user_agent: 'npm/10.9.2 node/v26.10.0' }), false)
  assert.equal(invokedByNonNpm({}), false)
  assert.equal(invokedByNonNpm({ npm_config_user_agent: 'npmx/1.0.0' }), true)
})

test('rejects non-npm managers with exit code 1', () => {
  for (const userAgent of [
    'pnpm/12.6.0 npm/? node/v26.10.0',
    'yarn/1.22.22 node/v26.10.0',
    'bun/1.2.0',
  ]) {
    const result = spawnSync(process.execPath, ['scripts/package-manager.mjs'], {
      encoding: 'utf8',
      env: {
        ...process.env,
        npm_config_user_agent: userAgent,
      },
    })
    assert.equal(result.status, 1)
  }
})
