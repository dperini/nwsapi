import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { JSDOM } from 'jsdom'
import { test } from 'vitest'
import { writeBenchmarkCharts } from '../../../../scripts/repo/bench/chart-report.mts'

test('benchmark report regenerates grouped SVGs from recorded data and available provenance', () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'nwsapi-chart-report-'))
  const rows = [
    {
      category: 'identifiers',
      selector: '#a',
      milliseconds: [1, 2],
      errors: [null, null],
    },
    {
      category: 'unknown',
      selector: '.a',
      milliseconds: [2, 1],
      errors: [null, null],
    },
  ]
  const metadata = {
    fixture: 'components',
    node: '26',
    jsdom: '27',
    rounds: 3,
    timestamp: '2026-10-07T00:00:00Z',
    engines: [{ name: 'nwsapi 3.0.0' }, { name: 'other 2.0.0' }],
    candidateSha256: 'engine',
  }
  try {
    writeBenchmarkCharts(directory, metadata, rows)
    assert.deepEqual(readdirSync(directory).toSorted(), [
      'identifiers-1.svg',
      'unknown-1.svg',
    ])
    const svg = new JSDOM(
      readFileSync(path.join(directory, 'identifiers-1.svg'), 'utf8'),
      { contentType: 'image/svg+xml' },
    )
    assert.equal(
      svg.window.document.querySelector('title')!.textContent,
      'Basic selectors',
    )
    svg.window.close()
    writeBenchmarkCharts(
      directory,
      {
        fixture: 'unknown',
        node: '26',
        rounds: 3,
        timestamp: metadata.timestamp,
        engines: metadata.engines,
        runtime: 'Chromium',
        candidateCommit: 'commit',
      },
      rows,
    )
    writeBenchmarkCharts(
      directory,
      {
        fixture: 'unknown',
        node: '26',
        rounds: 3,
        timestamp: metadata.timestamp,
        engines: metadata.engines,
      },
      rows,
    )
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})
