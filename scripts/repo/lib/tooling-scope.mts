import { globSync } from 'node:fs'
import { REPO_ROOT } from './paths.mts'

export function toolingFiles() {
  return globSync(
    [
      'src/**/*.mts',
      'scripts/repo/**/*.mts',
      'test/repo/**/*.mts',
      '.config/*.mts',
      '.config/*.d.ts',
    ],
    { cwd: REPO_ROOT },
  ).toSorted()
}
