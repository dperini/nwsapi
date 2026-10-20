import { rm } from 'node:fs/promises'
import path from 'node:path'
import { parseArgs } from 'node:util'
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
  const { values } = parseArgs({
    args: args.filter(arg => arg !== '--'),
    options: {
      scope: { type: 'string', default: 'outputs' },
      apply: { type: 'boolean' },
      'dry-run': { type: 'boolean' },
      json: { type: 'boolean' },
      describe: { type: 'boolean' },
      help: { type: 'boolean', short: 'h' },
    },
  })
  if (values.help) {
    log(
      'Usage: npm run clean [-- --dry-run]\nRemoves generated outputs.\nTo preview a reset: npm run reset:dependencies or npm run reset:tools\nAdd -- --apply to a reset command to remove the listed files.',
    )
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
  const scope = values.scope as Scope
  if (!Object.hasOwn(scopes, scope)) {
    throw new Error('Choose --scope outputs, dependencies, or tools.')
  }
  const preview = values['dry-run'] || (scope !== 'outputs' && !values.apply)
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
