import assert from 'node:assert/strict'
import vm from 'node:vm'
import { test } from 'vitest'
import { replaceCacheLimit } from '../../../../scripts/repo/bench/cache-source.mts'

test('cache replacement respects parsed literal boundaries and tolerates sparse array nodes', () => {
  const result = replaceCacheLimit(
    'let CACHE_LIMIT = 100; const gaps = [,,,];',
    13,
  )
  const values = new vm.Script(
    result + ';[CACHE_LIMIT,gaps.length,0 in gaps]',
  ).runInNewContext() as unknown[]
  assert.deepEqual(Array.from(values), [13, 3, false])
  const invalid = [0, -1, 1.5, Infinity, Number.MAX_SAFE_INTEGER + 1]
  for (let index = 0, length = invalid.length; index < length; index += 1) {
    assert.throws(
      () => replaceCacheLimit('let CACHE_LIMIT = 1;', invalid[index]!),
      RangeError,
    )
  }
  const anchors = [
    'let other=1;',
    'var CACHE_LIMIT=1;var CACHE_LIMIT=2;',
    'let CACHE_LIMIT="1";',
    'let CACHE_LIMIT=1+1;',
    'let CACHE_LIMIT;',
  ]
  for (let index = 0, length = anchors.length; index < length; index += 1) {
    assert.throws(() => replaceCacheLimit(anchors[index]!, 13))
  }
})
