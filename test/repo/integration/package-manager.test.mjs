import assert from 'node:assert/strict'
import { test } from 'node:test'
import { packageManagerNotice } from '../../../scripts/lib/package-manager.mjs'

test('stable v2 recommends npm and prerelease recommends pnpm', () => {
  assert.match(
    packageManagerNotice('2.2.28', 'pnpm/12.6.0 npm/? node/v26.10.0'),
    /stable v2 branch.*npm install/,
  )
  assert.match(
    packageManagerNotice('2.3.0-prerelease', 'npm/10.9.2 node/v26.10.0'),
    /prerelease branch.*pnpm install/,
  )
})

test('the preferred package manager and other tools do not produce a notice', () => {
  assert.equal(
    packageManagerNotice('2.2.28', 'npm/10.9.2 node/v26.10.0'),
    undefined,
  )
  assert.equal(
    packageManagerNotice('2.3.0-prerelease', 'pnpm/12.7.0 npm/? node/v26.10.0'),
    undefined,
  )
  assert.equal(packageManagerNotice('2.2.28', 'bun/1.2.0'), undefined)
})
