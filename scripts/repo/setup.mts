import {
  BROWSER_SETUP_PATH,
  UPSTREAM_HELPER_PATH,
  WPT_CANDIDATES_PATH,
} from './lib/paths.mts'
import { isMainModule, runNode } from './lib/run-node.mts'

export function setupUpstream(run = runNode) {
  run(UPSTREAM_HELPER_PATH, ['clone'])
  run(UPSTREAM_HELPER_PATH, ['verify'])
  run(WPT_CANDIDATES_PATH, [])
  run(BROWSER_SETUP_PATH, [])
}

if (isMainModule(import.meta.url)) {
  setupUpstream()
}
