import { generateAgentFavicon } from '../../gen/ai/favicon.mts'
import { isMainModule } from '../../lib/run-node.mts'

if (isMainModule(import.meta.url)) {
  if (process.argv.includes('--help')) {
    console.log('Usage: pnpm run ai:favicon:check')
  } else {
    generateAgentFavicon(true)
  }
}
