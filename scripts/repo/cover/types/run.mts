import { REPO_ROOT } from '../../lib/paths.mts'
import { runTypeCoverage, writeTypeCoverage } from '../../lib/type-coverage.mts'

writeTypeCoverage(REPO_ROOT, runTypeCoverage(REPO_ROOT))
