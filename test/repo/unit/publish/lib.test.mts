import assert from 'node:assert/strict'
import { test } from 'node:test'
import { packDetails } from '../../../../scripts/publish/lib.mjs'

test('npm pack metadata supports old and current JSON shapes with a useful invalid-output error', () => {
  const packed = { filename: 'nwsapi.tgz', files: [{ path: 'LICENSE' }] }
  for (const response of [[packed], { nwsapi: packed }, packed]) {
    assert.equal(packDetails(response), packed)
  }
  for (const response of [
    undefined,
    [],
    [packed, packed],
    { nwsapi: { files: [{}] } },
  ]) {
    assert.throws(() => packDetails(response), /invalid package metadata/)
  }
})
