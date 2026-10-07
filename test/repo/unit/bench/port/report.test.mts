import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { gunzipSync } from 'node:zlib'
import { test } from 'vitest'
import { writeTimingReport } from '../../../../../scripts/repo/bench/port/report.mts'

test('timing report archives raw rounds and retains compact sample ranges with matching fingerprints', () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'nwsapi-port-report-'))
  const output = path.join(directory, 'timing.json')
  try {
    const input = {
      host: 'fixture',
      rows: [
        {
          name: 'case',
          matches: 2,
          samples: [
            [
              { round: 0, p50Ns: 3, samplesNs: [1, 3, 8] },
              { round: 1, p50Ns: 0, samplesNs: [] },
            ],
          ],
        },
      ],
    }
    writeTimingReport(output, input)
    const report = JSON.parse(readFileSync(output, 'utf8'))
    const archive = readFileSync(path.join(directory, report.rawSamples.file))
    assert.deepEqual(JSON.parse(gunzipSync(archive).toString()), [
      { name: 'case', samples: [[[1, 3, 8], []]] },
    ])
    assert.equal(
      report.rawSamples.sha256,
      createHash('sha256').update(archive).digest('hex'),
    )
    assert.deepEqual(report.rows[0].samples, [
      [
        { round: 0, p50Ns: 3, sampleCount: 3, minNs: 1, maxNs: 8 },
        { round: 1, p50Ns: 0, sampleCount: 0 },
      ],
    ])
    assert.equal(report.host, 'fixture')
    assert.equal(report.rows[0].matches, 2)
    assert.deepEqual(input.rows[0]!.samples[0]![0]!.samplesNs, [1, 3, 8])
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})
