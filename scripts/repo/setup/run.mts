import {
  BROWSER_SETUP_PATH,
  TOOL_SETUP_PATH,
  UPSTREAM_HELPER_PATH,
  WPT_CANDIDATES_PATH,
} from '../lib/paths.mts'
import { isMainModule, runNode } from '../lib/run-node.mts'
import { REPO_ROOT } from '../lib/paths.mts'
import path from 'node:path'

export function setupUpstream(run = runNode) {
  run(TOOL_SETUP_PATH, [])
  run(path.join(REPO_ROOT, 'scripts/repo/setup/security.mts'), [])
  run(UPSTREAM_HELPER_PATH, ['clone'])
  run(UPSTREAM_HELPER_PATH, ['verify'])
  run(WPT_CANDIDATES_PATH, [])
  run(BROWSER_SETUP_PATH, [])
}

if (isMainModule(import.meta.url)) {
  setupUpstream()
}
