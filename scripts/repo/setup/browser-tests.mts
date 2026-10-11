import { BROWSER_SETUP_PATH, WPT_CANDIDATES_PATH } from '../lib/paths.mts'
import { isMainModule, runNode } from '../lib/run-node.mts'
import { setupWpt } from './wpt.mts'

export function setupBrowserTests(run = runNode) {
  console.log(
    'Preparing WPT and Chrome. Existing verified downloads are reused.',
  )
  setupWpt(run)
  run(WPT_CANDIDATES_PATH, [])
  run(BROWSER_SETUP_PATH, [])
}

if (isMainModule(import.meta.url)) {
  if (process.argv.includes('--help') || process.argv.includes('-h')) {
    console.log(
      'Usage: npm run setup:wpt\nPrepares the pinned WPT checkout and Chrome for browser tasks.',
    )
  } else {
    setupBrowserTests()
  }
}
