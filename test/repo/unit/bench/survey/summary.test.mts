import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { expect, test } from 'vitest'
import {
  readSurveySummary,
  summarizeFiles,
  summarizeSurvey,
} from '../../../../../scripts/repo/bench/survey/summary.mts'

const measurement = {
  metadata: {
    labels: ['candidate', 'baseline'],
    variants: ['after', 'before'],
  },
  rows: [
    {
      id: 'fixture/a',
      family: 'fixture',
      samples: [
        [10, 12, 11],
        [20, 24, 22],
      ],
    },
  ],
}

test('summaries follow variant labels and retain paired round variation', () => {
  const summary = summarizeSurvey(measurement)
  expect(summary.geomeanSpeedup).toBe(2)
  expect(summary.largestSlowdown).toBe(0)
  expect(summary.rows[0]).toMatchObject({
    speedup: 2,
    baseline: { min: 20, median: 22, max: 24 },
    candidate: { min: 10, median: 11, max: 12 },
    relativeChange: { min: -0.5, median: -0.5, max: -0.5 },
  })
  const reversed = summarizeSurvey({
    ...measurement,
    metadata: { ...measurement.metadata, labels: ['baseline', 'candidate'] },
  })
  expect(reversed.geomeanSpeedup).toBe(0.5)
  expect(reversed.largestSlowdown).toBe(1)
})

test('summaries reject missing variants, empty inputs, and unmatched samples', () => {
  expect(() => summarizeFiles([])).toThrow(/Usage/)
  expect(() => summarizeSurvey({ ...measurement, rows: [] })).toThrow(
    /measured rows/,
  )
  expect(() =>
    summarizeSurvey({ ...measurement, metadata: { labels: [], variants: [] } }),
  ).toThrow(/labels/)
  expect(() =>
    summarizeSurvey({
      ...measurement,
      rows: [{ id: 'fixture/a', family: 'fixture', samples: [[1], [1, 2]] }],
    }),
  ).toThrow(/Unmatched/)
})

test('file summaries preserve input hashes and the complete measurement metadata', t => {
  const directory = mkdtempSync(
    path.join(os.tmpdir(), 'nwsapi-survey-summary-'),
  )
  t.onTestFinished(() => rmSync(directory, { recursive: true, force: true }))
  const file = path.join(directory, 'result.json')
  writeFileSync(file, JSON.stringify(measurement))
  const result = readSurveySummary(file)
  expect(result.sha256).toMatch(/^[a-f0-9]{64}$/)
  expect(result.metadata).toEqual(measurement.metadata)
  expect(result.rows).toHaveLength(1)
  expect(summarizeFiles([file])).toEqual([result])
})
