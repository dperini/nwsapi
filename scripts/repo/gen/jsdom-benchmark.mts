import { readFileSync, writeFileSync } from 'node:fs'
import { chart } from '../bench/charts.mts'
import type { Measurement } from '../bench/charts.mts'
import { geometricSpeedup } from '../bench/summary-chart.mts'
import { isMainModule } from '../lib/run-node.mts'

export function writeJsdomBenchmark() {
  const report: {
    metadata: {
      jsdomVersion: string
      node: string
      installations: Array<{ selector: string; version: string }>
    }
    rows: Measurement[]
  } = JSON.parse(readFileSync('assets/repo/bench/jsdom-override.json', 'utf8'))
  const shown = [
    '.card',
    '[data-testid]',
    'input:read-write',
    '.card:has(> input) > button',
  ]
  writeFileSync(
    'assets/repo/bench/jsdom-override.svg',
    chart(
      'Public jsdom selector queries',
      report.metadata.installations.map(
        installation => `${installation.selector} v${installation.version}`,
      ),
      shown.map(selector =>
        report.rows.find(row => row.selector === selector)!,
      ),
      `Node.js ${report.metadata.node} · jsdom ${report.metadata.jsdomVersion} · public document.querySelectorAll()`,
      'Warm calls · nine rotating Mitata rounds · setup excluded',
      'Public querySelectorAll() calls. Construction and package installation are excluded.',
    ),
  )
  const filename = 'docs/repo/perf/jsdom.md'
  const source = readFileSync(filename, 'utf8')
  const start = '<!-- jsdom-summary:start -->'
  const end = '<!-- jsdom-summary:end -->'
  if (!source.includes(start) || !source.includes(end)) {
    throw new Error('Missing jsdom summary markers.')
  }
  const ratio = geometricSpeedup(report.rows)
  const summary = `The \`nwsapi\` override is **${(ratio >= 1 ? ratio : 1 / ratio).toFixed(2)}× ${ratio >= 1 ? 'faster' : 'slower'}** across ${report.rows.length} selectors, using the geometric mean of their speed ratios. Each selector has equal weight. These timings measure repeated queries and exclude application startup.`
  writeFileSync(
    filename,
    source.slice(0, source.indexOf(start) + start.length) +
      '\n\n' +
      summary +
      '\n\n' +
      source.slice(source.indexOf(end)),
  )
}

if (isMainModule(import.meta.url)) {
  writeJsdomBenchmark()
}
