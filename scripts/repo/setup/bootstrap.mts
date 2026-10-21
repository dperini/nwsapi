import { parseArgs } from 'node:util'
import path from 'node:path'
import { isMainModule } from '../lib/run-node.mts'
import { executeManaged, setupNotice } from './manager.mts'
import type { ManagedRun } from './manager.mts'
import { setupTools } from './tools.mts'
import { buildReadiness } from './build.mts'
import {
  REPO_ROOT,
  DEVELOPER_MENU_COMMAND,
  normalizePath,
} from '../lib/paths.mts'
import {
  managedNodeEntry,
  toolDirectory,
  toolPlan,
  toolPlatform,
  toolVersions,
} from '../external-tools.mts'
import { recordSetupProgress } from './progress.mts'
import { setupVoiceOver } from './voiceover/run.mts'
import type { VoiceOverChoice } from './voiceover/run.mts'
import { buildRequiredFiles } from './build.mts'
import { bootstrapNodeIssue } from './node-version.mts'

const TOOL_NAMES = ['nub', 'pnpm', 'npm', 'sfw', 'mise'] as const

export function bootstrapPlan(
  toolsOnly = false,
  root = REPO_ROOT,
  platform = process.platform,
) {
  const bin = path.join(root, '.cache/bin')
  const cache = path.join(root, '.cache/external-tools')
  const platformName = toolPlatform(platform)
  const targets = [
    ...TOOL_NAMES.flatMap(name => {
      const plan = toolPlan(name, platformName)
      return [
        path.relative(root, toolDirectory(plan, cache)),
        path.relative(
          root,
          path.join(bin, `${name}${platform === 'win32' ? '.cmd' : ''}`),
        ),
      ]
    }),
    path.relative(root, managedNodeEntry(bin, platform)),
    path.relative(root, path.join(bin, 'toolchain.json')),
  ]
  if (platform === 'win32') {
    targets.push(
      ...['npm.cmd', 'pnpm.cmd'].map(name =>
        path.relative(root, path.join(bin, name)),
      ),
    )
  }
  const steps = [
    'Download or verify pinned checkout tools',
    ...(toolsOnly
      ? []
      : [
          'Install locked package dependencies into node_modules/',
          'Run package preparation and build missing outputs',
        ]),
  ]
  const outputs = [
    '.cache/setup-progress.json',
    ...(toolsOnly
      ? []
      : ['node_modules/', ...buildRequiredFiles().map(file => file.output)]),
  ]
  return {
    schemaVersion: 1,
    type: 'preview',
    command: 'setup/bootstrap',
    root,
    tools: TOOL_NAMES.map(name => {
      const plan = toolPlan(name, platformName)
      return { name, version: plan.version, asset: plan.asset }
    }),
    steps,
    targets: [...new Set([...targets, ...outputs])].map(target =>
      normalizePath(
        path.isAbsolute(target) ? path.relative(root, target) : target,
      ),
    ),
  }
}

export function describeBootstrap() {
  return {
    schemaVersion: 1,
    type: 'command',
    name: 'setup/bootstrap',
    description:
      'Install pinned tools and dependencies, then prepare the checkout.',
    options: ['--json', '--describe', '--dry-run', '--tools-only'],
    mutates: true,
  }
}

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

export function completed(
  name: string,
  result: Awaited<ReturnType<ManagedRun>>,
) {
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
    run(
      ['install', '--frozen-lockfile', '--reporter=silent', '--loglevel=error'],
      directory,
    ),
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
  const protocolResult = handleBootstrapProtocol(values, log)
  if (protocolResult) {
    return protocolResult
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

export function handleBootstrapProtocol(
  values: ReturnType<typeof parseSetupOptions>,
  log: (message: string) => void,
) {
  if (values.describe) {
    log(
      values.json
        ? JSON.stringify(describeBootstrap())
        : 'setup/bootstrap: Install pinned tools and dependencies, then prepare the checkout. Use --dry-run to list planned stages and paths.',
    )
    return { status: 0, signal: null }
  }
  if (values['dry-run']) {
    const plan = bootstrapPlan(values['tools-only'])
    log(values.json ? JSON.stringify(plan) : formatBootstrapPlan(plan))
    return { status: 0, signal: null }
  }
  return undefined
}

const SETUP_HELP =
  'Usage: node scripts/repo/setup/bootstrap.mts [--tools-only] [--voiceover|--no-voiceover] [--dry-run]\nPrepares checkout tools, installs dependencies, and builds the package.\nVoiceOver is optional and runs after successful core setup.\nBrowser, WPT, and scanner setup are separate tasks.\n-h, --help  Show this help without downloading tools.\n--json  Return a machine-readable result.\n--describe  Describe this command without setup.\n--dry-run  List planned stages and paths without changes.\n--tools-only  Install the pinned tools without installing dependencies.\n--voiceover  Explicitly opt in to optional macOS VoiceOver setup.\n--no-voiceover  Skip the optional VoiceOver prompt.'

export async function runCoreSetup(
  toolsOnly = false,
  runtimeVersion = process.versions.node,
  setup: typeof setupTools = setupTools,
  run: ManagedRun = executeManaged,
  log = console.log,
) {
  const issue = bootstrapNodeIssue(runtimeVersion)
  if (issue) {
    log(issue)
    return { status: 1, signal: null }
  }
  return bootstrap(toolsOnly, setup, run, 'no')
}

export function parseSetupOptions(args: string[]) {
  return parseArgs({
    args: args[0] === '--' ? args.slice(1) : args,
    options: {
      help: { type: 'boolean', short: 'h' },
      'tools-only': { type: 'boolean' },
      voiceover: { type: 'boolean' },
      'no-voiceover': { type: 'boolean' },
      'dry-run': { type: 'boolean' },
      json: { type: 'boolean' },
      describe: { type: 'boolean' },
    },
  }).values
}

export function invalidSetupOptions(
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

export function setupChoice(
  values: ReturnType<typeof parseSetupOptions>,
): VoiceOverChoice {
  return values.voiceover ? 'yes' : values['no-voiceover'] ? 'no' : 'ask'
}

if (isMainModule(import.meta.url)) {
  const json = process.argv.includes('--json')
  const preview =
    process.argv.includes('--dry-run') || process.argv.includes('--describe')
  const originalLog = console.log
  if (json && !preview) {
    console.log = (...messages: unknown[]) => console.error(...messages)
  }
  const result = await main()
  console.log = originalLog
  if (json && !preview) {
    originalLog(
      JSON.stringify({
        schemaVersion: 1,
        type: 'result',
        status: result.status === 0 && !result.signal ? 'completed' : 'failed',
        exitCode: result.status ?? 1,
        signal: result.signal,
      }),
    )
  }
  if (result.signal) {
    process.kill(process.pid, result.signal)
  } else {
    process.exitCode = result.status ?? 1
  }
}

export function formatBootstrapPlan(plan: ReturnType<typeof bootstrapPlan>) {
  return [
    `Would prepare ${plan.command} in ${plan.root}:`,
    ...plan.steps.map(step => `  ${step}`),
    'Targets:',
    ...plan.targets.map(target => `  ${target}`),
  ].join('\n')
}
