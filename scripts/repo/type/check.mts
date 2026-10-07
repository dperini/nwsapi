import { isMainModule, runNode } from '../lib/run-node.mts'
import { TSRS_CLI_PATH, TYPECHECK_CONFIG_PATH } from '../lib/paths.mts'
if (isMainModule(import.meta.url)) {
  if (process.argv.includes('--help')) {
    console.log('Usage: pnpm run type:check')
  } else {
    runNode(TSRS_CLI_PATH, ['--noEmit', '-p', TYPECHECK_CONFIG_PATH])
  }
}
