import { globSync } from 'node:fs'
import { normalizePath, REPO_ROOT } from './paths.mts'

export function toolingFiles(root = REPO_ROOT) {
  return globSync(
    [
      'vitest.config.mts',
      'src/**/*.mts',
      'src/external/*.js',
      'src/**/*.d.ts',
      'scripts/repo/**/*.mts',
      'test/repo/**/*.mts',
      '.config/*.mts',
      '.config/repo/**/*.mts',
      '.config/*.d.ts',
      '.github/**/*.mts',
    ],
    { cwd: root },
  )
    .map(normalizePath)
    .toSorted()
}
