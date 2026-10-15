import { rm } from 'node:fs/promises'
import path from 'node:path'
import { parseArgs } from 'node:util'
import { REPO_ROOT } from './lib/paths.mts'
import { isMainModule } from './lib/run-node.mts'

const scopes = {
  outputs: ['dist', 'coverage', 'playwright-report', 'test-results', '.tmp'],
  dependencies: ['node_modules'],
  tools: [
    '.cache/bin',
    '.cache/external-tools',
    '.cache/mise',
    '.cache/setup-progress.json',
  ],
} as const

type Scope = keyof typeof scopes

export async function main(args = process.argv.slice(2), log = console.log) {
  const { values } = parseArgs({
    args: args.filter(arg => arg !== '--'),
    options: {
      scope: { type: 'string', default: 'outputs' },
      apply: { type: 'boolean' },
      'dry-run': { type: 'boolean' },
      help: { type: 'boolean', short: 'h' },
    },
  })
  if (values.help) {
    log(
      'Usage: npm run clean [-- --dry-run]\nRemoves generated outputs.\nTo preview a reset: npm run reset:dependencies or npm run reset:tools\nAdd -- --apply to a reset command to remove the listed files.',
    )
    return
  }
  const scope = values.scope as Scope
  if (!Object.hasOwn(scopes, scope)) {
    throw new Error('Choose --scope outputs, dependencies, or tools.')
  }
  const preview = values['dry-run'] || (scope !== 'outputs' && !values.apply)
  log(`${preview ? 'Would remove' : 'Removing'} from this checkout:`)
  for (const file of scopes[scope]) {
    log(`  ${file}`)
  }
  if (preview) {
    log(
      scope === 'outputs'
        ? 'Next: npm run clean'
        : `Next: npm run reset:${scope} -- --apply`,
    )
    return
  }
  for (const file of scopes[scope]) {
    await rm(path.join(REPO_ROOT, file), { force: true, recursive: true })
  }
  log(
    scope === 'outputs'
      ? 'Cleanup complete. Next: npm run build'
      : 'Reset complete. Next: npm run go',
  )
}

if (isMainModule(import.meta.url)) {
  await main()
}
