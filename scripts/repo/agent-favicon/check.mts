import { generateAgentFavicon } from '../gen/agent-favicon.mts'
import { isMainModule } from '../lib/run-node.mts'

if (isMainModule(import.meta.url)) {
  if (process.argv.includes('--help')) {
    console.log('Usage: pnpm run agent-favicon:check')
  } else {
    generateAgentFavicon(true)
  }
}
