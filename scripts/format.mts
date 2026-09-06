import { execFileSync } from 'node:child_process'
import { globSync } from 'node:fs'
import { REPO_ROOT } from './lib/paths.mts'
import { toolingFiles } from './lib/tooling-scope.mts'

execFileSync(
  process.execPath,
  [
    'node_modules/oxfmt/bin/oxfmt',
    '--config',
    '.config/oxfmt.json',
    ...toolingFiles(),
    ...globSync('.config/*.json', { cwd: REPO_ROOT }),
    ...process.argv.slice(2),
  ],
  { cwd: REPO_ROOT, stdio: 'inherit' },
)
