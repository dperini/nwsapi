import { globSync } from 'node:fs'
import { REPO_ROOT } from './paths.mts'

export function toolingFiles() {
  return globSync(
    [
      'vitest.config.mts',
      'bin/**/*.mts',
      'src/**/*.mts',
      'src/external/*.js',
      'src/**/*.d.ts',
      'scripts/repo/**/*.mts',
      'test/repo/**/*.mts',
      '.config/*.mts',
      '.config/repo/**/*.mts',
      '.config/*.d.ts',
    ],
    { cwd: REPO_ROOT },
  ).toSorted()
}
