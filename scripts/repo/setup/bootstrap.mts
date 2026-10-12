import { parseArgs } from 'node:util'
import { isMainModule } from '../lib/run-node.mts'
import { executeManaged, setupNotice } from './manager.mts'
import type { ManagedRun } from './manager.mts'
import { setupTools } from './tools.mts'
import { recordSetupProgress } from './progress.mts'

async function phase<T>(name: string, action: () => T | Promise<T>) {
  console.log(name)
  recordSetupProgress(name, 'running')
  try {
    const result = await action()
    recordSetupProgress(name, 'complete')
    return result
  } catch (error) {
    recordSetupProgress(name, 'paused')
    throw error
  }
}

function completed(name: string, result: Awaited<ReturnType<ManagedRun>>) {
  if (result.status !== 0 || result.signal) {
    recordSetupProgress(name, 'paused')
    console.error(`Setup paused at ${name}.`)
    console.error(
      'Next: run pnpm run setup again. Downloaded tools and dependencies are reused when valid.',
    )
    return false
  }
  return true
}

export async function bootstrap(
  toolsOnly = false,
  setup = setupTools,
  run: ManagedRun = executeManaged,
) {
  const directory = await phase(
    toolsOnly
      ? '1 of 1: Prepare checkout tools'
      : '1 of 3: Prepare checkout tools',
    setup,
  )
  if (toolsOnly) {
    console.log(
      'Checkout tools ready. Next: pnpm run setup to install dependencies.',
    )
    return { status: 0, signal: null }
  }
  const installation = '2 of 3: Install dependencies'
  const result = await phase(installation, () =>
    run(['install', '--frozen-lockfile'], directory),
  )
  if (!completed(installation, result)) {
    return result
  }
  // Repeat installs may skip lifecycle scripts even when build output is missing.
  const preparation = '3 of 3: Build package'
  const prepared = await phase(preparation, () =>
    run(['run', 'prepare'], directory),
  )
  if (completed(preparation, prepared)) {
    console.log(
      'Setup complete. Next: pnpm run guide to browse the docs and choose a change.',
    )
  }
  return prepared
}

export async function main(
  args = process.argv.slice(2),
  run = bootstrap,
  log = console.log,
) {
  const { values } = parseArgs({
    args: args[0] === '--' ? args.slice(1) : args,
    options: {
      help: { type: 'boolean', short: 'h' },
      'tools-only': { type: 'boolean' },
    },
  })
  if (values.help) {
    log(
      'Usage: pnpm run setup [--tools-only]\nPrepares checkout tools, installs dependencies, and builds the package.\nBrowser, WPT, and scanner setup are separate tasks.\n-h, --help  Show this help without downloading tools.\n--tools-only  Install the pinned tools without installing dependencies.',
    )
    return { status: 0, signal: null }
  }
  log(setupNotice())
  log(
    'Requires network access on the first run. Tools stay in this checkout. Completed downloads are reused on retry.',
  )
  try {
    return await run(values['tools-only'])
  } catch (error) {
    log(
      `Setup paused: ${error instanceof Error ? error.message : String(error)}`,
    )
    log(
      'Next: resolve the error above, then run pnpm run setup again. Check setup tools: pnpm run setup:check --details',
    )
    return { status: 1, signal: null }
  }
}

if (isMainModule(import.meta.url)) {
  const result = await main()
  if (result.signal) {
    process.kill(process.pid, result.signal)
  } else {
    process.exitCode = result.status ?? 1
  }
}
