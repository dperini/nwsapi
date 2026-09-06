import { checkCode } from './check.mts'
import {
  API_SCRIPT_PATH,
  SVG_CHECK_SCRIPT_PATH,
  FORMAT_SCRIPT_PATH,
  LINT_SCRIPT_PATH,
} from './lib/paths.mts'
import { isMainModule, runNode } from './lib/run-node.mts'

export function fixCode(run = runNode) {
  // Lint can apply fixes and still report errors. Format before the final check.
  try {
    run(LINT_SCRIPT_PATH, ['--fix'])
  } catch {
    // The final check reports any errors that formatting does not resolve.
  }
  run(FORMAT_SCRIPT_PATH, [])
  run(API_SCRIPT_PATH, [])
  run(SVG_CHECK_SCRIPT_PATH, ['--fix'])
  checkCode(run)
}

if (isMainModule(import.meta.url)) {
  if (process.argv.slice(2).some(arg => arg !== '--all')) {
    throw new Error('Usage: pnpm run fix [--all]')
  }
  fixCode()
}
