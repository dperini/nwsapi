import { object } from '@optique/core/constructs'
import { message } from '@optique/core/message'
import { withDefault } from '@optique/core/modifiers'
import { flag } from '@optique/core/primitives'
import type { InferValue } from '@optique/core/parser'
import { HELP_SHOWN, runCli } from '../lib/cli/parser.mts'
import {
  BROWSER_SETUP_PATH,
  TOOL_SETUP_PATH,
  WPT_CANDIDATES_PATH,
  REPO_ROOT,
} from '../lib/paths.mts'
import { isMainModule, runNode } from '../lib/run-node.mts'
import { setupWpt } from './wpt.mts'
import path from 'node:path'
import os from 'node:os'
import { setupVoiceOver } from './voiceover/run.mts'
import type { VoiceOverChoice } from './voiceover/run.mts'

const setupParser = object({
  voiceover: withDefault(flag('--voiceover'), false),
  noVoiceover: withDefault(flag('--no-voiceover'), false),
  json: withDefault(flag('--json'), false),
  describe: withDefault(flag('--describe'), false),
  dryRun: withDefault(flag('--dry-run'), false),
})
type SetupOptions = InferValue<typeof setupParser>

export function fullSetupPlan(root = REPO_ROOT) {
  return {
    schemaVersion: 1,
    type: 'preview',
    command: 'setup/full',
    steps: [
      'Install the complete pinned checkout tool set.',
      'Install security scanners and their isolated environments.',
      'Prepare the upstream WPT checkout and candidate inventory.',
      'Install the pinned Chrome for Testing build.',
      'Optionally prepare macOS VoiceOver assets and settings.',
    ],
    targets: [
      path.join(root, '.cache/external-tools'),
      path.join(root, '.cache/security'),
      path.join(root, 'upstream/wpt'),
      path.join(os.homedir(), '.cache/nwsapi/browsers'),
    ],
  }
}

export function describeFullSetup() {
  return {
    schemaVersion: 1,
    type: 'command',
    name: 'setup/full',
    description: 'Prepare all checkout tools, scanners, WPT, and Chrome.',
    options: [
      '--json',
      '--describe',
      '--dry-run',
      '--voiceover',
      '--no-voiceover',
    ],
    mutates: true,
  }
}

export function setupUpstream(run = runNode) {
  run(TOOL_SETUP_PATH, ['--full'])
  run(path.join(REPO_ROOT, 'scripts/repo/setup/security.mts'), [])
  setupWpt(run)
  run(WPT_CANDIDATES_PATH, [])
  run(BROWSER_SETUP_PATH, [])
}

export async function main(
  args = process.argv.slice(2),
  setup: () => void = setupUpstream,
  optional: typeof setupVoiceOver = setupVoiceOver,
  log = console.log,
) {
  const values = runCli(
    setupParser,
    'setup:full',
    args[0] === '--' ? args.slice(1) : args,
    {
      brief: message`Prepare all checkout tools, scanners, WPT, and Chrome.`,
    },
  )
  if (values === HELP_SHOWN) {
    return { status: 0, signal: null }
  }
  const protocol = fullSetupProtocol(values, log)
  if (protocol) {
    return protocol
  }
  log(
    'Preparing security scanners, WPT, and Chrome. This may download additional tools and upstream sources.',
  )
  try {
    setup()
  } catch (error) {
    log(
      `Full setup paused: ${error instanceof Error ? error.message : String(error)}`,
    )
    return { status: 1, signal: null }
  }
  log('Full setup complete. Next: npm run check')
  const choice: VoiceOverChoice = values.voiceover
    ? 'yes'
    : values.noVoiceover
      ? 'no'
      : 'ask'
  const voiceOverResult = await optional({ choice })
  if (voiceOverResult.status !== 0 || voiceOverResult.signal) {
    return voiceOverResult
  }
  return { status: 0, signal: null }
}

export function fullSetupProtocol(
  values: SetupOptions,
  log: (message: string) => void,
) {
  if (values.voiceover && values.noVoiceover) {
    log('Choose only one of --voiceover or --no-voiceover.')
    return { status: 2, signal: null }
  }
  if (values.describe) {
    const description = describeFullSetup()
    log(values['json'] ? JSON.stringify(description) : description.description)
    return { status: 0, signal: null }
  }
  if (values.dryRun) {
    const plan = fullSetupPlan()
    log(values['json'] ? JSON.stringify(plan) : formatFullSetupPlan(plan))
    return { status: 0, signal: null }
  }
  return undefined
}

export function formatFullSetupPlan(plan: ReturnType<typeof fullSetupPlan>) {
  return [
    'Would prepare the full contributor environment:',
    ...plan.steps.map(step => `  ${step}`),
    'Targets:',
    ...plan.targets.map(target => `  ${target}`),
  ].join('\n')
}

if (isMainModule(import.meta.url)) {
  const result = await main()
  if (result.signal) {
    process.kill(process.pid, result.signal)
  } else {
    process.exitCode = result.status ?? 1
  }
}
