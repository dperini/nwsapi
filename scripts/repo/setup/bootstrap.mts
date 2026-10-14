import { parseArgs } from 'node:util'
import { isMainModule } from '../lib/run-node.mts'
import { executeManaged, setupNotice } from './manager.mts'
import type { ManagedRun } from './manager.mts'
import { setupTools } from './tools.mts'
import { buildReadiness } from './build.mts'
import { REPO_ROOT, DEVELOPER_MENU_COMMAND } from '../lib/paths.mts'
import { toolVersions } from '../external-tools.mts'
import { recordSetupProgress } from './progress.mts'
import { setupVoiceOver } from './voiceover/run.mts'
import type { VoiceOverChoice } from './voiceover/run.mts'

export async function phase<T>(name: string, action: () => T | Promise<T>) {
  const started = performance.now()
  console.log(name)
  recordSetupProgress(name, 'running')
  try {
    const result = await action()
    const outcome =
      typeof result === 'object' && result !== null && 'status' in result
        ? (result as { status: number | null; signal?: string | null })
        : undefined
    const paused = outcome && (outcome.status !== 0 || Boolean(outcome.signal))
    const elapsedMs = Math.round(performance.now() - started)
    recordSetupProgress(name, paused ? 'paused' : 'complete', elapsedMs)
    console.log(`Finished ${name} in ${elapsedMs}ms.`)
    return result
  } catch (error) {
    recordSetupProgress(name, 'paused', Math.round(performance.now() - started))
    throw error
  }
}

function completed(name: string, result: Awaited<ReturnType<ManagedRun>>) {
  if (result.status !== 0 || result.signal) {
    recordSetupProgress(name, 'paused')
    console.error(`Setup paused at ${name}.`)
    console.error(
      'Next: node scripts/repo/setup/bootstrap.mts. Verified downloads and dependencies are reused when valid.',
    )
    return false
  }
  return true
}

export async function bootstrap(
  toolsOnly = false,
  setup = setupTools,
  run: ManagedRun = executeManaged,
  voiceOverChoice: VoiceOverChoice = 'ask',
  setupOptionalVoiceOver = setupVoiceOver,
  outputsReady = () => buildReadiness(REPO_ROOT).ready,
) {
  const directory = await phase(
    toolsOnly
      ? '1 of 1: Prepare checkout tools'
      : '1 of 3: Prepare checkout tools',
    setup,
  )
  if (toolsOnly) {
    console.log(
      'Checkout tools ready. Next: node scripts/repo/setup/bootstrap.mts to install dependencies.',
    )
    return { status: 0, signal: null }
  }
  const installation = '2 of 3: Install dependencies and prepare package'
  const result = await phase(installation, () =>
    run(['install', '--frozen-lockfile'], directory),
  )
  if (!completed(installation, result)) {
    return result
  }
  const preparation = '3 of 3: Verify package outputs'
  const prepared = await phase(preparation, () => {
    if (outputsReady()) {
      return { status: 0, signal: null }
    }
    console.log('Build outputs are missing. Repairing preparation.')
    return run(['run', 'prepare'], directory)
  })
  if (completed(preparation, prepared)) {
    console.log(
      `Core checkout: ready. Tools: verified. Dependencies: installed. Build: ready.\nWorkflow: pnpm ${toolVersions()['pnpm']}.\nNext: ${DEVELOPER_MENU_COMMAND.join(' ')}`,
    )
    const optional = await setupOptionalVoiceOver({ choice: voiceOverChoice })
    if (optional.status !== 0 || optional.signal) {
      console.error(
        'Core checkout: ready. Optional VoiceOver setup: incomplete.',
      )
      console.error(
        'Retry optional setup: node scripts/repo/setup/voiceover/run.mts',
      )
      return optional
    }
  }
  return prepared
}

export async function main(
  args = process.argv.slice(2),
  run: (
    toolsOnly?: boolean,
  ) => Promise<Awaited<ReturnType<typeof bootstrap>>> = runCoreSetup,
  log = console.log,
  setupOptionalVoiceOver = setupVoiceOver,
) {
  const values = parseSetupOptions(args)
  const invalid = invalidSetupOptions(values, log)
  if (invalid) {
    return invalid
  }
  if (values.help) {
    log(SETUP_HELP)
    return { status: 0, signal: null }
  }
  log(setupNotice())
  log(
    'Requires network access on the first run. Tools stay in this checkout. Completed downloads are reused on retry.',
  )
  try {
    const result = await run(values['tools-only'])
    if (!values['tools-only'] && result.status === 0 && !result.signal) {
      const optional = await setupOptionalVoiceOver({
        choice: setupChoice(values),
      })
      if (optional.status !== 0 || optional.signal) {
        log('Core checkout: ready. Optional VoiceOver setup: incomplete.')
        log('Retry optional setup: node scripts/repo/setup/voiceover/run.mts')
        return optional
      }
    }
    return result
  } catch (error) {
    log(
      `Setup paused: ${error instanceof Error ? error.message : String(error)}`,
    )
    log(
      'Next: resolve the error above, then run node scripts/repo/setup/bootstrap.mts. Check tools: node scripts/repo/setup/doctor.mts --details',
    )
    return { status: 1, signal: null }
  }
}

const SETUP_HELP =
  'Usage: node scripts/repo/setup/bootstrap.mts [--tools-only] [--voiceover|--no-voiceover]\nPrepares checkout tools, installs dependencies, and builds the package.\nVoiceOver is optional and runs after successful core setup.\nBrowser, WPT, and scanner setup are separate tasks.\n-h, --help  Show this help without downloading tools.\n--tools-only  Install the pinned tools without installing dependencies.\n--voiceover  Explicitly opt in to optional macOS VoiceOver setup.\n--no-voiceover  Skip the optional VoiceOver prompt.'

async function runCoreSetup(toolsOnly = false) {
  return bootstrap(toolsOnly, setupTools, executeManaged, 'no')
}

function parseSetupOptions(args: string[]) {
  return parseArgs({
    args: args[0] === '--' ? args.slice(1) : args,
    options: {
      help: { type: 'boolean', short: 'h' },
      'tools-only': { type: 'boolean' },
      voiceover: { type: 'boolean' },
      'no-voiceover': { type: 'boolean' },
    },
  }).values
}

function invalidSetupOptions(
  values: ReturnType<typeof parseSetupOptions>,
  log: (message: string) => void,
) {
  if (values['tools-only'] && values.voiceover) {
    log(
      '--voiceover requires full setup. Run node scripts/repo/setup/bootstrap.mts without --tools-only.',
    )
    return { status: 2, signal: null }
  }
  if (values.voiceover && values['no-voiceover']) {
    log('Choose only one of --voiceover or --no-voiceover.')
    return { status: 2, signal: null }
  }
  return undefined
}

function setupChoice(
  values: ReturnType<typeof parseSetupOptions>,
): VoiceOverChoice {
  return values.voiceover ? 'yes' : values['no-voiceover'] ? 'no' : 'ask'
}

if (isMainModule(import.meta.url)) {
  const result = await main()
  if (result.signal) {
    process.kill(process.pid, result.signal)
  } else {
    process.exitCode = result.status ?? 1
  }
}
