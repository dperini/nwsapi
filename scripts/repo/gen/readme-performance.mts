import { refreshChartReferences } from './chart-references.mts'
import { readFileSync, writeFileSync } from 'node:fs'
import { queryStateNote } from '../bench/chart-theme.mts'
import type { QueryChartOptions } from '../bench/query-chart.mts'
import { queryChart, wrapQueryNotes } from '../bench/query-chart.mts'

const root = new URL('../../../', import.meta.url)
const data: {
  rows: QueryChartOptions['rows']
  metadata: { competitor: string; jsdom: string; node: string; cpu: string }
} = JSON.parse(
  readFileSync(
    new URL('assets/repo/bench/first-query-states.json', root),
    'utf8',
  ),
)
const rows = data.rows
if (
  rows.length !== 12 ||
  rows.some(row =>
    [...row.warm, ...row.cold].some(
      value => !Number.isFinite(value) || value <= 0,
    ),
  )
) {
  throw new Error(
    'Review the chart layout and measurements when query fixtures change',
  )
}
const ratios = rows.map(row => row.warm[1] / row.warm[0])
const range = `${Math.min(...ratios).toFixed(1)}–${Math.max(...ratios).toFixed(1)}×`
const coldRatios = rows.map(row => row.cold[1] / row.cold[0])
const coldRange = `${Math.min(...coldRatios).toFixed(1)}–${Math.max(...coldRatios).toFixed(1)}×`
writeFileSync(
  new URL('assets/repo/bench/perf-hero.svg', root),
  queryChart({
    names: ['nwsapi', '@asamuzakjp/dom-selector'],
    rows,
    metadataStart: 3,
    notes: await wrapQueryNotes(
      [
        'Queries model React/Next.js components, Tailwind-style classes, and Testing Library test IDs.',
        queryStateNote,
        `Cold speedups were ${coldRange}. Warm speedups were ${range}.`,
        [
          { code: 'nwsapi' },
          ' v2.3.0-prerelease · ',
          { code: '@asamuzakjp/dom-selector' },
          ` v${data.metadata.competitor} · `,
          { code: 'jsdom' },
          ` v${data.metadata.jsdom}`,
        ],
        [
          'Direct engine API ',
          { code: 'first()' },
          ' vs ',
          { code: 'jsdom' },
          ' ',
          { code: 'querySelector()' },
          ` · Node.js ${data.metadata.node} · ${data.metadata.cpu}`,
        ],
      ],
      [1, 2, 3, 4],
    ),
  }),
)

refreshChartReferences()
