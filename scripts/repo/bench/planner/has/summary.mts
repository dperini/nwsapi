import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { brotliCompressSync, constants, gzipSync } from 'node:zlib'
import { ENGINE_BUILD_PATH } from '../../../lib/paths.mts'
import { sha256 } from '../../footprint/shared.mts'
import type { Row } from '../measure.mts'

const [directory, baseline] = process.argv.slice(2)
if (!directory || !baseline) {
  throw new Error(
    'Usage: planner/has/summary.mts measurement-directory baseline.cjs',
  )
}
const geomean = (values: number[]) =>
  Math.exp(
    values.reduce((sum, value) => sum + Math.log(value), 0) / values.length,
  )
const summary: Record<string, unknown> = {}
for (const host of ['chromium', 'jsdom']) {
  const phases: Record<string, unknown> = {}
  for (const phase of ['preflight', 'confirmation', 'confirmation-repeat']) {
    const data = JSON.parse(
      readFileSync(path.join(directory, `${host}-${phase}.json`), 'utf8'),
    ) as { rows: Row[] }
    const rows = data.rows
    phases[phase] = {
      cases: rows.length,
      speedup: geomean(rows.map(row => row.costs[0]! / row.costs[1]!)),
      worst: Math.max(...rows.map(row => row.costs[1]! / row.costs[0]!)),
      holdoutSpeedup: geomean(
        rows
          .filter(row => row.split === 'holdout')
          .map(row => row.costs[0]! / row.costs[1]!),
      ),
    }
  }
  summary[host] = phases
}
summary['footprint'] = [baseline, ENGINE_BUILD_PATH].map(file => {
  const bytes = readFileSync(file)
  return {
    sha256: sha256(bytes),
    bytes: bytes.length,
    gzip9: gzipSync(bytes, { level: 9 }).length,
    brotli11: brotliCompressSync(bytes, {
      params: { [constants.BROTLI_PARAM_QUALITY]: 11 },
    }).length,
  }
})
const cold = JSON.parse(
  readFileSync(path.join(directory, 'jsdom-cold.json'), 'utf8'),
) as { rows: Row[] }
summary['cold'] = {
  speedup: geomean(cold.rows.map(row => row.costs[0]! / row.costs[1]!)),
  worst: Math.max(...cold.rows.map(row => row.costs[1]! / row.costs[0]!)),
}
writeFileSync(
  path.join(directory, 'implementation-summary.json'),
  JSON.stringify(summary, null, 2) + '\n',
)
