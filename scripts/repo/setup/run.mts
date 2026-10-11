import {
  BROWSER_SETUP_PATH,
  TOOL_SETUP_PATH,
  WPT_CANDIDATES_PATH,
} from '../lib/paths.mts'
import { isMainModule, runNode } from '../lib/run-node.mts'
import { REPO_ROOT } from '../lib/paths.mts'
import { setupWpt } from './wpt.mts'
import path from 'node:path'

export function setupUpstream(run = runNode) {
  run(TOOL_SETUP_PATH, [])
  run(path.join(REPO_ROOT, 'scripts/repo/setup/security.mts'), [])
  setupWpt(run)
  run(WPT_CANDIDATES_PATH, [])
  run(BROWSER_SETUP_PATH, [])
}

if (isMainModule(import.meta.url)) {
  if (process.argv.includes('--help') || process.argv.includes('-h')) {
    console.log(
      'Usage: npm run setup:full\nPrepares tools, security scanners, WPT, and Chrome. Existing verified downloads are reused.',
    )
  } else {
    console.log(
      'Preparing security scanners, WPT, and Chrome. This may download additional tools and upstream sources.',
    )
    setupUpstream()
    console.log('Full setup complete. Next: npm run check')
  }
}
