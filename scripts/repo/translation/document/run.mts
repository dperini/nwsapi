import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { object } from '@optique/core/constructs'
import { message } from '@optique/core/message'
import { argument } from '@optique/core/primitives'
import { choice } from '@optique/core/valueparser'
import { run } from '@optique/run'
import { REPO_ROOT } from '../../lib/paths.mts'
import { collectTranslationInput } from '../inventory.mts'
import { documentAliases, resolveTranslationDocument } from './path.mts'

const sources = collectTranslationInput().documents.map(
  document => document.source,
)
const aliases = documentAliases(sources)
const names = [...aliases.keys()].toSorted()
if (process.argv.length === 2) {
  console.log(names.join('\n'))
  process.exit(0)
}
const { name } = run(object({ name: argument(choice(names)) }), {
  programName: 'docs:translate',
  help: 'option',
  completion: 'both',
  brief: message`Translate one known repository document to Italian.`,
})
const documentPath = resolveTranslationDocument(REPO_ROOT, name, sources)

const runner = path.join(REPO_ROOT, 'scripts/repo/run.mts')
const tasks = [
  ['scripts/repo/translation/prepare.mts', documentPath],
  ['scripts/repo/translation/run.mts'],
  ['scripts/repo/translation/publish.mts', documentPath],
  ['scripts/repo/translation/check.mts'],
]
for (const task of tasks) {
  const result = spawnSync(
    process.execPath,
    [runner, task[0]!, ...task.slice(1)],
    { cwd: REPO_ROOT, stdio: 'inherit' },
  )
  if (result.error) {
    throw result.error
  }
  if (result.status !== 0) {
    process.exitCode = result.status ?? 1
    break
  }
}
