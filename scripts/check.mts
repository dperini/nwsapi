import {
  API_SCRIPT_PATH,
  SVG_CHECK_SCRIPT_PATH,
  FORMAT_SCRIPT_PATH,
  LINT_SCRIPT_PATH,
  TSC_CLI_PATH,
  TSC_CONFIG_PATH,
} from './lib/paths.mts'
import { isMainModule, runNode } from './lib/run-node.mts'
import { toolVersions } from './external-tools.mts'

export function checkCode(run = runNode) {
  toolVersions()
  run(API_SCRIPT_PATH, ['--check'])
  run(SVG_CHECK_SCRIPT_PATH, [])
  run(FORMAT_SCRIPT_PATH, ['--check'])
  run(LINT_SCRIPT_PATH, [])
  run(TSC_CLI_PATH, ['--noEmit', '-p', TSC_CONFIG_PATH])
}

if (isMainModule(import.meta.url)) {
  if (process.argv.slice(2).some(arg => arg !== '--all')) {
    throw new Error('Usage: pnpm run check [--all]')
  }
  checkCode()
}
