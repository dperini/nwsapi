import type { runTranslations as RunTranslations } from './engine.mts'
import { createRequire } from 'node:module'
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { object } from '@optique/core/constructs'
import { message as optiqueMessage } from '@optique/core/message'
import { withDefault } from '@optique/core/modifiers'
import { argument } from '@optique/core/primitives'
import { choice } from '@optique/core/valueparser'
import { HELP_SHOWN, runCli } from '../lib/cli/parser.mts'
import { REPO_ROOT, uvExecutablePath } from '../lib/paths.mts'

const require = createRequire(import.meta.url)

const project = path.join(REPO_ROOT, '.config/docs-translation')
const options = runCli(
  object({
    task: withDefault(argument(choice(['setup', 'translate'])), 'translate'),
  }),
  'docs:translate:engine',
  process.argv.slice(2),
  { brief: optiqueMessage`Set up or run the pinned translation engine.` },
)
if (options === HELP_SHOWN) {
  process.exit(0)
}
const { task } = options
if (task === 'setup') {
  execFileSync(
    uvExecutablePath(),
    [
      'run',
      '--project',
      project,
      '--locked',
      'python',
      path.join(REPO_ROOT, 'scripts/repo/translation/setup.py'),
    ],
    { cwd: REPO_ROOT, stdio: 'inherit' },
  )
} else {
  const { runTranslations } = require('./engine.mts') as {
    runTranslations: typeof RunTranslations
  }
  await runTranslations()
}
