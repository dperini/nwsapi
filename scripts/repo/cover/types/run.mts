import { writeFileSync } from 'node:fs'
import path from 'node:path'
import { measureNativeTypeCoverage } from './analysis.mts'
import type { UntypedIdentifier } from './analysis.mts'
import { REPO_ROOT } from '../../lib/paths.mts'
import {
  runTypeCoverage,
  writeTypeCoverage,
  checkTypeCoverage,
} from '../../lib/type-coverage.mts'

const details: Array<{ file: string; identifiers: UntypedIdentifier[] }> = []
const report = process.argv.includes('--details')
const metric = runTypeCoverage(REPO_ROOT, config =>
  measureNativeTypeCoverage(
    config,
    report
      ? (file, identifiers) => {
          details.push({ file: path.relative(REPO_ROOT, file), identifiers })
        }
      : undefined,
  ),
)
writeTypeCoverage(REPO_ROOT, metric)
if (report) {
  details.sort((a, b) => b.identifiers.length - a.identifiers.length)
  writeFileSync(
    path.join(REPO_ROOT, 'coverage/type-coverage-details.json'),
    JSON.stringify(details, null, 2) + '\n',
  )
}
checkTypeCoverage(metric)
