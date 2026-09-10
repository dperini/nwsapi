import {
  PLAYWRIGHT_CLI_PATH,
  UPSTREAM_HELPER_PATH,
  WPT_CANDIDATES_PATH,
} from './lib/paths.mts'
import { isMainModule, runNode } from './lib/run-node.mts'

export function setupUpstream(run = runNode) {
  run(UPSTREAM_HELPER_PATH, ['clone'])
  run(UPSTREAM_HELPER_PATH, ['verify'])
  run(WPT_CANDIDATES_PATH, [])
  run(PLAYWRIGHT_CLI_PATH, ['install', 'chromium'])
}

if (isMainModule(import.meta.url)) {
  setupUpstream()
}
