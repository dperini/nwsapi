import { execFileSync } from 'node:child_process'
import { REPO_ROOT } from './lib/paths.mts'
import { toolingFiles } from './lib/tooling-scope.mts'

execFileSync(
  process.execPath,
  [
    'node_modules/oxlint/bin/oxlint',
    '--config',
    '.config/oxlint.json',
    '--tsconfig',
    '.config/tsconfig.check.json',
    ...toolingFiles(),
    ...process.argv.slice(2),
  ],
  { cwd: REPO_ROOT, stdio: 'inherit' },
)
