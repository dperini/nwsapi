import { UPSTREAM_HELPER_PATH } from '../lib/paths.mts'
import { isMainModule, runNode } from '../lib/run-node.mts'

export function setupWpt(run = runNode) {
  run(UPSTREAM_HELPER_PATH, ['clone', 'upstream/wpt'])
  run(UPSTREAM_HELPER_PATH, ['verify', 'upstream/wpt'])
}

if (isMainModule(import.meta.url)) {
  setupWpt()
}
