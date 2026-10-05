import { isMainModule, runNode } from '../lib/run-node.mts'
import { TSC_CLI_PATH, TSC_CONFIG_PATH } from '../lib/paths.mts'
if (isMainModule(import.meta.url)) {
  if (process.argv.includes('--help')) {
    console.log('Usage: pnpm run type:check')
  } else {
    runNode(TSC_CLI_PATH, ['--noEmit', '-p', TSC_CONFIG_PATH])
  }
}
