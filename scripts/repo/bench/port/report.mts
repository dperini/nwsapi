import { createHash } from 'node:crypto'
import { writeFileSync } from 'node:fs'
import path from 'node:path'
import { gzipSync } from 'node:zlib'

interface PortReport {
  rows: Array<{
    name: string
    samples: Array<Array<{ samplesNs: number[]; [key: string]: unknown }>>
    [key: string]: unknown
  }>
  [key: string]: unknown
}

export function writeTimingReport(output: string, report: PortReport) {
  const raw = report.rows.map(row => ({
    name: row.name,
    samples: row.samples.map(rounds => rounds.map(round => round.samplesNs)),
  }))
  const archive = gzipSync(JSON.stringify(raw), { level: 9 })
  const samplesFile = output.replace(/\.json$/, '.samples.json.gz')
  writeFileSync(samplesFile, archive)
  const compact = {
    ...report,
    rawSamples: {
      file: path.basename(samplesFile),
      sha256: createHash('sha256').update(archive).digest('hex'),
    },
    rows: report.rows.map(row => ({
      ...row,
      samples: row.samples.map(rounds =>
        rounds.map(({ samplesNs, ...round }) => ({
          ...round,
          sampleCount: samplesNs.length,
          minNs: samplesNs[0],
          maxNs: samplesNs[samplesNs.length - 1],
        })),
      ),
    })),
  }
  writeFileSync(output, JSON.stringify(compact, null, 2) + '\n')
}
