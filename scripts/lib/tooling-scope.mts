import { globSync } from 'node:fs'
import { REPO_ROOT } from './paths.mts'

export function toolingFiles() {
  return globSync(
    [
      'src/**/*.mts',
      'scripts/**/*.mts',
      'test/*.test.mts',
      'test/jsdom-adapter-package.mts',
      'test/upstream/*.mts',
      '.config/*.mts',
      '.config/*.d.ts',
    ],
    { cwd: REPO_ROOT },
  ).toSorted()
}
