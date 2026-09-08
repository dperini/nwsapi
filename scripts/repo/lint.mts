import { runTool } from './lib/run-tool.mts'
import { toolingFiles } from './lib/tooling-scope.mts'

runTool([
  'node_modules/oxlint/bin/oxlint',
  '--config',
  '.config/oxlint.json',
  '--tsconfig',
  '.config/tsconfig.check.json',
  ...toolingFiles(),
  ...process.argv.slice(2),
])
