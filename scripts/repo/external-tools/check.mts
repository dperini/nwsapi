import { checkExternalTools } from '../external-tools.mts'
import { isMainModule } from '../lib/run-node.mts'

if (isMainModule(import.meta.url)) {
  if (process.argv.includes('--help')) {
    console.log('Usage: pnpm run external-tools:check')
  } else {
    checkExternalTools()
  }
}
