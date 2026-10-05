import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { parseArgs } from 'node:util'
import { createHash } from 'node:crypto'
import { splitCharts } from '../charts.mts'
import { readReport } from './model.mts'
import { atlasChart } from './chart.mts'
import { atlasPage } from './page.mts'

const { values } = parseArgs({
  options: {
    input: { type: 'string' },
    output: { type: 'string' },
    help: { type: 'boolean' },
  },
})
if (values.help) {
  console.log(
    'Usage: atlas/run.mts --input results.json [--output directory]\nRenders two-engine warm all-results measurements into standalone SVG charts and a searchable HTML report. Does not run benchmarks.',
  )
} else {
  if (!values.input) {
    throw new Error('Supply --input results.json. Use --help for usage.')
  }
  const input = readFileSync(values.input, 'utf8')
  const report = readReport(input)
  const output = path.resolve(
    values.output ?? path.join(path.dirname(values.input), 'atlas'),
  )
  mkdirSync(output, { recursive: true })
  const panels = splitCharts(report.rows).map((group, index) => {
    const file = `chart-${index + 1}.svg`
    const category = group.rows[0]!.category
    writeFileSync(
      path.join(output, file),
      atlasChart(
        category[0]!.toUpperCase() + category.slice(1),
        report.metadata.engines.map(engine => engine.name),
        group.rows,
        `${report.metadata.runtime ?? 'Runtime unrecorded'} · ${report.metadata.rounds} rounds · ${report.metadata.power ?? 'Power unrecorded'} · ${report.metadata.timestamp.slice(0, 10)} · ${(report.metadata.candidateSha256 ?? '').slice(0, 12)}`,
      ),
    )
    return { category, file, selectors: group.rows.map(row => row.selector) }
  })
  writeFileSync(path.join(output, 'measurements.json'), input)
  writeFileSync(
    path.join(output, 'index.html'),
    atlasPage(report, panels, createHash('sha256').update(input).digest('hex')),
  )
  console.log(
    `Rendered ${report.rows.length} cases in ${panels.length} charts: ${output}`,
  )
}
