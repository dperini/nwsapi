import assert from 'node:assert/strict'
import { test } from 'vitest'
import {
  kib,
  median,
  provenance,
  sha256,
  summarize,
} from '../../../../../scripts/repo/bench/footprint/shared.mts'

test('memory summaries preserve finite raw samples and calculate median for even and odd rounds', () => {
  assert.equal(median([10, 1, 5]), 5)
  assert.equal(median([10, 1, 5, 4]), 4.5)
  assert.throws(() => median([]), RangeError)
  assert.throws(() => median([Infinity]), RangeError)
  const values = [10, 1, 5]
  assert.deepEqual(summarize(values), {
    median: 5,
    min: 1,
    max: 10,
    samples: values,
  })
  assert.deepEqual(values, [10, 1, 5])
  assert.equal(kib(2048), '2.00KiB')
})

test('benchmark provenance fingerprints the exact engine and dependency inputs', () => {
  const evidence = provenance()
  assert.equal(evidence.node, process.version)
  assert.equal(evidence.platform, `${process.platform}/${process.arch}`)
  assert.equal(new Date(evidence.timestamp).toISOString(), evidence.timestamp)
  assert.equal(evidence.candidateSha256.length, 64)
  assert.equal(evidence.lockfileSha256.length, 64)
  assert.equal(typeof evidence.jsdom, 'string')
  assert.equal(typeof evidence.competitorVersion, 'string')
  assert.equal(typeof evidence.candidateVersion, 'string')
  assert.equal(sha256('abc'), sha256(Buffer.from('abc')))
})
