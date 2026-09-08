import { readFileSync, writeFileSync } from 'node:fs'
import { refreshChartReferences } from './chart-references.mts'
import { compactQueryChart } from '../bench/compact-query-chart.mts'
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
  new URL('assets/repo/bench/perf-hero.svg', root),
  compactQueryChart({
    names: ['nwsapi', '@asamuzakjp/dom-selector'],
    rows: data.rows,
    notes: [
      'Cold: first query on a fresh engine/document. Warm: repeated query. Setup excluded.',
      `Direct first() / querySelector() · ${data.metadata.runtime} · ${data.metadata.cpu}`,
      `nwsapi v${data.metadata.candidateVersion} · @asamuzakjp/dom-selector v${data.metadata.competitor} · No jsdom`,
    ],
  }),
)
refreshChartReferences()
