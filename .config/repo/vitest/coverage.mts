import path from 'node:path'
import { outputs } from '../../build.config.mts'
import { createV8CoverageModule } from '../../../scripts/fleet/cover/v8-provider.mts'
import { REPO_ROOT } from '../../../scripts/repo/lib/paths.mts'

export default createV8CoverageModule({
  untransformedFiles: outputs.map(file => path.resolve(REPO_ROOT, file)),
})
