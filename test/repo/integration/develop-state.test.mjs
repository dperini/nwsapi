import assert from 'node:assert/strict'
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import {
  DEVELOPER_STATE_MAX_AGE_MS,
  readDeveloperState,
  writeDeveloperState,
} from '../../../scripts/develop/state.mts'

function temporaryCheckout() {
  const root = mkdtempSync(path.join(tmpdir(), 'nwsapi-menu-state-'))
  mkdirSync(path.join(root, '.cache'))
  return root
}

test('stores private, checkout-bound task metadata and ignores stale or unknown data', t => {
  const root = temporaryCheckout()
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const identity = { checkout: realpathSync(root), revision: 'abc123' }
  const now = 10_000
  const state = writeDeveloperState(root, identity, {
    taskId: 'review',
    status: 'failed',
    exitCode: 1,
    signal: null,
    updatedAt: new Date(now).toISOString(),
  })
  const file = path.join(root, '.cache/developer-state.json')

  assert.deepEqual(JSON.parse(readFileSync(file, 'utf8')), state)
  if (process.platform !== 'win32') {
    assert.equal(statSync(file).mode & 0o777, 0o600)
  }
  assert.deepEqual(readDeveloperState(root, identity, ['review'], now), state)
  assert.equal(
    readDeveloperState(
      root,
      { checkout: '/another/checkout', revision: 'abc123' },
      ['review'],
      now,
    ),
    undefined,
  )
  assert.equal(
    readDeveloperState(
      root,
      identity,
      ['review'],
      now + DEVELOPER_STATE_MAX_AGE_MS + 1,
    ),
    undefined,
  )

  writeFileSync(
    file,
    JSON.stringify({ ...state, environment: { TOKEN: 'secret' } }),
  )
  assert.equal(readDeveloperState(root, identity, ['review'], now), undefined)
})
