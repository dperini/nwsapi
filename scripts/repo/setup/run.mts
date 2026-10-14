import { parseArgs } from 'node:util'
import {
  BROWSER_SETUP_PATH,
  TOOL_SETUP_PATH,
  WPT_CANDIDATES_PATH,
  REPO_ROOT,
} from '../lib/paths.mts'
import { isMainModule, runNode } from '../lib/run-node.mts'
import { setupWpt } from './wpt.mts'
import path from 'node:path'
import { setupVoiceOver } from './voiceover/run.mts'
import type { VoiceOverChoice } from './voiceover/run.mts'

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
  const { values } = parseArgs({
    args: args[0] === '--' ? args.slice(1) : args,
    options: {
      help: { type: 'boolean', short: 'h' },
      voiceover: { type: 'boolean' },
      'no-voiceover': { type: 'boolean' },
    },
  })
  if (values.voiceover && values['no-voiceover']) {
    log('Choose only one of --voiceover or --no-voiceover.')
    return { status: 2, signal: null }
  }
  if (values.help) {
    log(
      'Usage: pnpm run setup:full [--voiceover|--no-voiceover]\nPrepares tools, security scanners, WPT, and Chrome. VoiceOver setup is optional and runs after core setup succeeds.',
    )
    return { status: 0, signal: null }
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
    : values['no-voiceover']
      ? 'no'
      : 'ask'
  const voiceOverResult = await optional({ choice })
  if (voiceOverResult.status !== 0 || voiceOverResult.signal) {
    return voiceOverResult
  }
  return { status: 0, signal: null }
}

if (isMainModule(import.meta.url)) {
  const result = await main()
  if (result.signal) {
    process.kill(process.pid, result.signal)
  } else {
    process.exitCode = result.status ?? 1
  }
}
