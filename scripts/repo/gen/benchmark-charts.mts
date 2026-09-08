import { globSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { writeBenchmarkCharts } from '../bench/chart-report.mts'

const root = fileURLToPath(
  new URL('../../../assets/repo/bench/', import.meta.url),
)
for (const file of globSync('**/results.json', { cwd: root })) {
  const { metadata, rows } = JSON.parse(
    readFileSync(path.join(root, file), 'utf8'),
  )
  writeBenchmarkCharts(path.dirname(path.join(root, file)), metadata, rows)
}
