import { readFileSync, writeFileSync } from 'node:fs'
import { refreshChartReferences } from './chart-references.mts'
import { compactQueryChart } from '../bench/compact-query-chart.mts'
import { geometricSpeedup, summaryChart } from '../bench/summary-chart.mts'
import type { Measurement } from '../bench/charts.mts'
import { kib } from '../bench/footprint-shared.mts'
import type { QueryChartOptions } from '../bench/query-chart.mts'

const root = new URL('../../../', import.meta.url)
const data: {
  rows: QueryChartOptions['rows']
  metadata: {
    runtime: string
    competitor: string
    candidateVersion: string
    cpu: string
  }
} = JSON.parse(
  readFileSync(
    new URL('assets/repo/bench/first-query-states.json', root),
    'utf8',
  ),
)
if (!data.metadata.runtime?.startsWith('Chromium')) {
  throw new Error(
    'Regenerate standalone browser measurements before publishing the hero.',
  )
}
writeFileSync(
  new URL('assets/repo/bench/first-matches.svg', root),
  compactQueryChart({
    names: ['nwsapi', '@asamuzakjp/dom-selector'],
    rows: data.rows
      .toSorted((a, b) => b.warm[1] / b.warm[0] - a.warm[1] / a.warm[0])
      .slice(0, 4),
    notes: [
      'Cold: first query on a fresh engine/document. Warm: repeated query. Setup excluded.',
      `Direct first() / querySelector() · ${data.metadata.runtime} · ${data.metadata.cpu}`,
      `nwsapi v${data.metadata.candidateVersion} · @asamuzakjp/dom-selector v${data.metadata.competitor} · No jsdom`,
    ],
  }),
)
const reports: Array<{ rows: Measurement[] }> = [
  'results.json',
  'documentation/results.json',
  'atomic/results.json',
].map(file =>
  JSON.parse(readFileSync(new URL('assets/repo/bench/' + file, root), 'utf8')),
)
const rows = reports.flatMap(report => report.rows)
const speedup = geometricSpeedup(rows)
const memory: {
  metadata: { queries: number }
  rows: Array<{ queried: { median: number } }>
} = JSON.parse(
  readFileSync(
    new URL('assets/repo/bench/memory-footprint.json', root),
    'utf8',
  ),
)
const sizes: { rows: Array<{ brotli: number }> } = JSON.parse(
  readFileSync(new URL('assets/repo/bench/file-size.json', root), 'utf8'),
)
const heap: [number, number] = [
  memory.rows[0]!.queried.median,
  memory.rows[1]!.queried.median,
]
const bytes: [number, number] = [sizes.rows[0]!.brotli, sizes.rows[1]!.brotli]
const reduction = (values: [number, number], labels: [string, string]) =>
  `${(Math.abs(1 - values[0] / values[1]) * 100).toFixed(1)}% ${labels[values[0] <= values[1] ? 0 : 1]}`
writeFileSync(
  new URL('assets/repo/bench/perf-hero.svg', root),
  summaryChart(
    [
      {
        title: 'Performance',
        detail: `${rows.length} warm all-results queries · Relative query time`,
        headline: `${Math.max(speedup, 1 / speedup).toFixed(2)}× ${speedup >= 1 ? 'faster' : 'slower'}`,
        values: [1 / speedup, 1],
        labels: [(1 / speedup).toFixed(2) + '×', '1.00×'],
      },
      {
        title: 'Memory footprint',
        detail: `Retained heap per engine after ${memory.metadata.queries} distinct queries`,
        headline: reduction(heap, ['less memory', 'more memory']),
        values: heap,
        labels: [kib(heap[0]), kib(heap[1])],
      },
      {
        title: 'Browser file size',
        detail: 'Brotli-compressed browser JavaScript',
        headline: reduction(bytes, ['smaller', 'larger']),
        values: bytes,
        labels: [kib(bytes[0]), kib(bytes[1])],
      },
    ],
    [
      `Performance: geometric mean of all ${rows.length} query speedups. Memory: native DOM allocation excluded.`,
      `Browser core / full comparison bundle · Brotli quality 11 · ${data.metadata.runtime} · ${data.metadata.cpu}`,
      `nwsapi v${data.metadata.candidateVersion} · @asamuzakjp/dom-selector v${data.metadata.competitor} · Methodology: docs/benchmarks.md`,
    ],
  ),
)
refreshChartReferences()
