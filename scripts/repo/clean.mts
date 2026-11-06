import { rm } from 'node:fs/promises'
import path from 'node:path'
import { object } from '@optique/core/constructs'
import { message } from '@optique/core/message'
import { withDefault } from '@optique/core/modifiers'
import { flag, option } from '@optique/core/primitives'
import { choice } from '@optique/core/valueparser'
import { HELP_SHOWN, runCli } from './lib/cli/parser.mts'
import { REPO_ROOT } from './lib/paths.mts'
import { isMainModule } from './lib/run-node.mts'

export const scopes = {
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

export function cleanPlan(scope: Scope, root = REPO_ROOT) {
  return {
    schemaVersion: 1,
    type: 'preview',
    command: 'clean',
    scope,
    root,
    changes: scopes[scope].map(file => path.join(root, file)),
  }
}

export function describeClean() {
  return {
    schemaVersion: 1,
    type: 'command',
    name: 'clean',
    description: 'Remove generated outputs or preview a dependency/tool reset.',
    options: ['--json', '--describe', '--dry-run', '--scope', '--apply'],
    scopes: Object.keys(scopes),
    mutates: true,
  }
}

export async function main(
  args = process.argv.slice(2),
  log = console.log,
  root = REPO_ROOT,
) {
  const parser = object({
    scope: withDefault(
      option('--scope', choice(['outputs', 'dependencies', 'tools'])),
      'outputs',
    ),
    apply: withDefault(flag('--apply'), false),
    dryRun: withDefault(flag('--dry-run'), false),
    json: withDefault(flag('--json'), false),
    describe: withDefault(flag('--describe'), false),
  })
  const values = runCli(
    parser,
    'clean',
    args.filter(arg => arg !== '--'),
    {
      brief: message`Remove generated outputs or preview a dependency/tool reset.`,
      showDefault: true,
    },
  )
  if (values === HELP_SHOWN) {
    return
  }
  if (values.describe) {
    const description = describeClean()
    log(
      values.json
        ? JSON.stringify(description)
        : `${description.name}: ${description.description}\nScopes: ${description.scopes.join(', ')}.`,
    )
    return
  }
  const scope: Scope = values.scope
  const preview = values.dryRun || (scope !== 'outputs' && !values.apply)
  const plan = cleanPlan(scope, root)
  if (preview) {
    log(values.json ? JSON.stringify(plan) : formatCleanPlan(plan))
    return
  }
  for (const file of scopes[scope]) {
    await rm(path.join(root, file), { force: true, recursive: true })
  }
  log(
    values.json
      ? JSON.stringify({ ...plan, type: 'result', status: 'completed' })
      : scope === 'outputs'
        ? 'Cleanup complete. Next: npm run build'
        : 'Reset complete. Next: npm run go',
  )
}

export function formatCleanPlan(plan: ReturnType<typeof cleanPlan>) {
  return [
    `Would remove from ${plan.root}:`,
    ...plan.changes.map(file => `  ${path.relative(plan.root, file)}`),
  ].join('\n')
}

if (isMainModule(import.meta.url)) {
  await main()
}
