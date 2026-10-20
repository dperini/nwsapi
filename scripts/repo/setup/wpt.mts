import path from 'node:path'
import { parseArgs } from 'node:util'
import { REPO_ROOT, UPSTREAM_HELPER_PATH } from '../lib/paths.mts'
import { isMainModule, runNode } from '../lib/run-node.mts'

export function setupWpt(run = runNode) {
  run(UPSTREAM_HELPER_PATH, ['clone', 'upstream/wpt'], {
    externalGit: true,
  })
  run(UPSTREAM_HELPER_PATH, ['verify', 'upstream/wpt'], {
    externalGit: true,
  })
}

export function wptSetupPlan(root = REPO_ROOT) {
  return {
    schemaVersion: 1,
    type: 'preview',
    command: 'setup/wpt',
    steps: [
      'Clone the pinned upstream WPT submodule if absent.',
      'Verify the checked out WPT revision.',
    ],
    targets: [path.join(root, 'upstream/wpt')],
  }
}

export function describeWptSetup() {
  return {
    schemaVersion: 1,
    type: 'command',
    name: 'setup/wpt',
    description: 'Clone or verify the pinned upstream WPT checkout.',
    options: ['--json', '--describe', '--dry-run'],
    mutates: true,
  }
}

export function main(args = process.argv.slice(2)) {
  const { values } = parseArgs({
    args: args[0] === '--' ? args.slice(1) : args,
    options: {
      help: { type: 'boolean', short: 'h' },
      json: { type: 'boolean' },
      describe: { type: 'boolean' },
      'dry-run': { type: 'boolean' },
    },
  })
  if (values.help) {
    console.log('Usage: pnpm run wpt:setup [--dry-run]')
    return
  }
  if (values.describe) {
    const description = describeWptSetup()
    console.log(
      values.json ? JSON.stringify(description) : description.description,
    )
    return
  }
  if (values['dry-run']) {
    const plan = wptSetupPlan()
    console.log(
      values.json
        ? JSON.stringify(plan)
        : `Would prepare WPT checkout:\n  ${plan.targets.join('\n  ')}`,
    )
    return
  }
  setupWpt()
}

if (isMainModule(import.meta.url)) {
  main()
}
