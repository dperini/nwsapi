import assert from 'node:assert/strict'
import { test } from 'node:test'
import { requireNpm } from '../../../scripts/lib/package-manager.mjs'

test('accepts npm and direct script execution', () => {
  assert.doesNotThrow(() => requireNpm('npm/10.9.2 node/v26.10.0'))
  assert.doesNotThrow(() => requireNpm(undefined))
})

test('rejects non-npm managers with a stable error code', () => {
  for (const userAgent of [
    'pnpm/12.6.0 npm/? node/v26.10.0',
    'yarn/1.22.22 node/v26.10.0',
    'bun/1.2.0',
  ]) {
    assert.throws(() => requireNpm(userAgent), error => {
      assert.equal(error.code, 'ERR_NON_NPM_PACKAGE_MANAGER')
      return true
    })
  }
})
