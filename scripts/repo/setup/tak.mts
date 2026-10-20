import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { parseArgs } from 'node:util'
import { isMainModule } from '../lib/run-node.mts'
import manifest from '../../../.config/external-tools.json' with { type: 'json' }
import { toolPlan, toolPlatform, toolVersions } from '../external-tools.mts'
import { installTool } from './install.mts'
import { activateTool } from './tools.mts'
import { REPO_ROOT } from '../lib/paths.mts'

export async function setupTak() {
  const platform =
    toolPlatform() as keyof (typeof manifest.tools)['tak']['platforms']
  if (!manifest.tools['tak'].platforms[platform]) {
    throw new Error(`tak has no pinned binary for ${platform}.`)
  }
  const executable = await installTool(toolPlan('tak', platform))
  const actual = execFileSync(executable, ['--version'], {
    encoding: 'utf8',
  }).trim()
  const expected = toolVersions()['tak']!
  if (!actual.includes(expected)) {
    throw new Error(`Expected tak ${expected}, received ${actual}.`)
  }
  activateTool('tak', executable)
  return executable
}

export function takSetupPlan(root = REPO_ROOT) {
  const platform =
    toolPlatform() as keyof (typeof manifest.tools)['tak']['platforms']
  const plan = toolPlan('tak', platform)
  return {
    schemaVersion: 1,
    type: 'preview',
    command: 'setup/tak',
    version: toolVersions()['tak'],
    asset: plan.asset,
    targets: [path.join(root, '.cache/bin/tak')],
  }
}

export function describeTakSetup() {
  return {
    schemaVersion: 1,
    type: 'command',
    name: 'setup/tak',
    description: 'Install and verify the pinned performance runner.',
    options: ['--json', '--describe', '--dry-run'],
    mutates: true,
  }
}

export async function main(args = process.argv.slice(2)) {
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
    console.log('Usage: pnpm run setup:tak [--dry-run]')
    return
  }
  if (values.describe) {
    const description = describeTakSetup()
    console.log(
      values.json ? JSON.stringify(description) : description.description,
    )
    return
  }
  if (values['dry-run']) {
    const plan = takSetupPlan()
    console.log(values.json ? JSON.stringify(plan) : formatTakSetupPlan(plan))
    return
  }
  const executable = await setupTak()
  console.log(`Verified tak ${toolVersions()['tak']}: ${executable}`)
}

export function formatTakSetupPlan(plan: ReturnType<typeof takSetupPlan>) {
  return [
    `Would install tak ${plan.version} from ${plan.asset}:`,
    ...plan.targets.map(target => `  ${target}`),
  ].join('\n')
}

if (isMainModule(import.meta.url)) {
  await main()
}
