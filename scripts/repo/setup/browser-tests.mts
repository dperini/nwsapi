import os from 'node:os'
import path from 'node:path'
import { parseArgs } from 'node:util'
import {
  BROWSER_SETUP_PATH,
  WPT_CANDIDATES_PATH,
  REPO_ROOT,
} from '../lib/paths.mts'
import { isMainModule, runNode } from '../lib/run-node.mts'
import { setupWpt } from './wpt.mts'

export function setupBrowserTests(run = runNode) {
  console.log(
    'Preparing WPT and Chrome. Existing verified downloads are reused.',
  )
  setupWpt(run)
  run(WPT_CANDIDATES_PATH, [])
  run(BROWSER_SETUP_PATH, [])
}

export function browserTestsPlan(root = REPO_ROOT, home = os.homedir()) {
  return {
    schemaVersion: 1,
    type: 'preview',
    command: 'setup/browser-tests',
    steps: [
      'Clone or verify the pinned upstream WPT checkout.',
      'Check the WPT candidate inventory.',
      'Install the pinned Chrome for Testing build.',
    ],
    targets: [
      path.join(root, 'upstream/wpt'),
      path.join(home, '.cache/nwsapi/browsers'),
    ],
  }
}

export function describeBrowserTestsSetup() {
  return {
    schemaVersion: 1,
    type: 'command',
    name: 'setup/browser-tests',
    description: 'Prepare the upstream WPT checkout and pinned Chrome.',
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
    console.log(
      'Usage: npm run setup:wpt [--dry-run]\nPrepares the pinned WPT checkout and Chrome for browser tasks.',
    )
    return
  }
  if (values.describe) {
    const description = describeBrowserTestsSetup()
    console.log(
      values.json ? JSON.stringify(description) : description.description,
    )
    return
  }
  if (values['dry-run']) {
    const plan = browserTestsPlan()
    console.log(
      values.json ? JSON.stringify(plan) : formatBrowserTestsPlan(plan),
    )
    return
  }
  setupBrowserTests()
}

export function formatBrowserTestsPlan(
  plan: ReturnType<typeof browserTestsPlan>,
) {
  return [
    'Would prepare browser testing:',
    ...plan.steps.map(step => `  ${step}`),
    'Targets:',
    ...plan.targets.map(target => `  ${target}`),
  ].join('\n')
}

if (isMainModule(import.meta.url)) {
  main()
}
