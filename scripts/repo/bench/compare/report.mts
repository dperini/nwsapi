import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'
import { readFileSync, readdirSync } from 'node:fs'
import { compareBenchmarkRounds } from '../../../fleet/bench/comparison.mts'
import { writeReport } from './options.mts'

interface TimingReport {
  hashes: string[]
  rows: Array<{
    matches: number
    selector: string
    measurements: Array<Array<{ round: number; p50Ns: number }>>
  }>
}
const root = new URL('../../../../assets/repo/bench/', import.meta.url)
const reports = readdirSync(root)
  .filter(
    name => name.startsWith('validation-') && name.endsWith('-timing.json'),
  )
  .toSorted()
  .map(file => {
    const source = readFileSync(new URL(file, root), 'utf8')
    const data = JSON.parse(source) as TimingReport
    return {
      file,
      sha256: createHash('sha256').update(source).digest('hex'),
      hashes: data.hashes,
      rows: data.rows.map(row => ({
        matches: row.matches,
        selector: row.selector,
        comparison: compareBenchmarkRounds(
          row.measurements[0]!.map(value => ({
            round: value.round,
            cost: value.p50Ns,
          })),
          row.measurements[1]!.map(value => ({
            round: value.round,
            cost: value.p50Ns,
          })),
        ),
      })),
    }
  })
writeReport(fileURLToPath(new URL('validation-summary.json', root)), {
  methodology:
    'Descriptive summaries of recorded per-round timing medians in nanoseconds. Pair variants by round ID. Relative change is (candidate - baseline) / baseline, so negative values mean lower cost. The median paired change can differ from the ratio of aggregate medians. Repeated rounds share process state. These summaries do not establish confidence intervals or an overall acceptance decision.',
  reports,
})
