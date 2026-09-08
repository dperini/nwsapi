import { readFileSync, writeFileSync } from 'node:fs'
import { queryChart } from '../bench/query-chart.mts'

const root = new URL('../../../', import.meta.url)
const data = JSON.parse(
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
writeFileSync(
  new URL('assets/repo/bench/perf-hero.svg', root),
  queryChart({
    names: ['nwsapi', '@asamuzakjp/dom-selector'],
    rows,
    notes: [
      'Queries model component trees, Tailwind-style classes, and Testing Library test IDs.',
      'Warm queries repeat a selector. Cold queries run it first on a fresh document.',
      `Warm speedups were ${range}. Cold results vary. Both engines use the same logarithmic scale.`,
      [
        { code: 'nwsapi' },
        ' 2.3.0-prerelease · ',
        { code: '@asamuzakjp/dom-selector' },
        ` ${data.metadata.competitor} · `,
        { code: 'jsdom' },
        ` ${data.metadata.jsdom}`,
      ],
      [
        'Direct engine API vs ',
        { code: 'jsdom' },
        ` querySelector · Node.js ${data.metadata.node.replace(/^v/, '')} · ${data.metadata.cpu}`,
      ],
    ],
  }),
)
