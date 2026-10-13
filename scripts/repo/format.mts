import { runTool } from './lib/run-tool.mts'
import { globSync } from 'node:fs'
import { normalizePath, REPO_ROOT } from './lib/paths.mts'
import { toolingFiles } from './lib/tooling-scope.mts'

runTool([
  'node_modules/oxfmt/bin/oxfmt',
  '--config',
  '.config/oxfmt.json',
  ...toolingFiles(),
  ...globSync('.config/*.json', { cwd: REPO_ROOT }).map(file =>
    normalizePath(file),
  ),
  ...process.argv.slice(2),
])
