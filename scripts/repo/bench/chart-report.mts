import { writeFileSync } from 'node:fs'
import path from 'node:path'
import { chart, splitCharts } from './charts.mts'
import type { Measurement } from './charts.mts'

interface ChartMetadata {
  fixture: string
  node: string
  jsdom: string
  rounds: number
  timestamp: string
  candidateCommit: string
  engines: Array<{ name: string }>
}

const titles: Record<string, string> = {
  identifiers: 'Basic selectors',
  attributes: 'Attribute selectors',
  relationships: 'Relationships',
  positional: 'Position selectors',
  logical: 'Logical selectors',
  forms: 'Form state selectors',
  components: 'Component queries',
  documentation: 'Documentation queries',
  atomic: 'Utility-class queries',
}

const fixtureLabels: Record<string, string> = {
  components: 'Component fixture',
  documentation: 'Documentation fixture',
  atomic: 'Utility-class fixture',
}

// Render recorded measurements without running the benchmarks again.
export function writeBenchmarkCharts(
  output: string,
  metadata: ChartMetadata,
  rows: Measurement[],
) {
  for (const group of splitCharts(rows)) {
    writeFileSync(
      path.join(output, `${group.name}.svg`),
      chart(
        titles[group.rows[0]!.category] ?? group.name,
        metadata.engines.map(engine =>
          engine.name.replace(/ (\d+\.\d+\.\d+)/, ' v$1'),
        ),
        group.rows,
        `${fixtureLabels[metadata.fixture] ?? 'Query fixture'} · Node.js ${metadata.node} · \`jsdom\` v${metadata.jsdom}`,
        `${metadata.timestamp.slice(0, 10)} · ${metadata.candidateCommit.slice(0, 8)}`,
      ),
    )
  }
}
