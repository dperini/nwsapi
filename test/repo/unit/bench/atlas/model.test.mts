import assert from 'node:assert/strict'
import { test } from 'vitest'
import {
  duration,
  ratioLabel,
  readReport,
  speedup,
} from '../../../../../scripts/repo/bench/atlas/model.mts'

const row = {
  category: 'class',
  selector: '.a',
  milliseconds: [1, 2],
  errors: [null, null],
  samples: [
    [1, 2],
    [2, 3],
  ],
}
const report = {
  metadata: { engines: [{ name: 'a' }, { name: 'b' }], rounds: 3 },
  rows: [row],
}

test('atlas validates benchmark correctness and timing evidence', () => {
  assert.deepEqual(readReport(JSON.stringify(report)), report)
  const invalid = [
    {},
    { ...report, metadata: { ...report.metadata, engines: [] } },
    { ...report, rows: [] },
    { ...report, metadata: { ...report.metadata, rounds: 0 } },
    { ...report, metadata: { ...report.metadata, rounds: 1.5 } },
    {
      ...report,
      metadata: { ...report.metadata, engines: [{ name: 3 }, { name: 'b' }] },
    },
    ...[
      { ...row, category: 1 },
      { ...row, selector: 1 },
      { ...row, milliseconds: [] },
      { ...row, errors: [] },
      { ...row, milliseconds: [0, 2] },
      { ...row, milliseconds: ['1', 2] },
      { ...row, errors: ['wrong result', null] },
      { ...row, samples: [[0], [2]] },
    ].map(invalidRow => ({ ...report, rows: [invalidRow] })),
  ]
  for (let index = 0, length = invalid.length; index < length; index += 1) {
    assert.throws(() => readReport(JSON.stringify(invalid[index])), TypeError)
  }
  assert.equal(
    readReport(
      JSON.stringify({
        ...report,
        rows: [
          {
            ...row,
            milliseconds: [null, 2],
            errors: ['unsupported', null],
            samples: undefined,
          },
        ],
      }),
    ).rows.length,
    1,
  )
})

test('atlas formats missing measurements and ratios consistently', () => {
  const parsed = readReport(JSON.stringify(report)).rows[0]!
  assert.equal(speedup(parsed), 2)
  assert.equal(ratioLabel(parsed), '2.00×')
  assert.equal(duration(0.001), '1.00µs')
  assert.equal(duration(2), '2.00ms')
  assert.equal(duration(null), 'unavailable')
  assert.equal(duration(undefined), 'unavailable')
  const absent = { ...parsed, milliseconds: [null, 2] as [null, number] }
  assert.equal(speedup(absent), null)
  assert.equal(ratioLabel(absent), 'unavailable')
})
