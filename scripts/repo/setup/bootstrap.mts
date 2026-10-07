import { parseArgs } from 'node:util'
import { isMainModule } from '../lib/run-node.mts'
import { executeManaged, setupNotice } from './manager.mts'
import type { ManagedRun } from './manager.mts'
import { setupTools } from './tools.mts'

export async function bootstrap(
  toolsOnly = false,
  setup = setupTools,
  run: ManagedRun = executeManaged,
) {
  const directory = await setup()
  if (toolsOnly) {
    return { status: 0, signal: null }
  }
  const result = run(['install', '--frozen-lockfile'], directory)
  if (result.status !== 0 || result.signal) {
    return result
  }
  // Repeat installs may skip lifecycle scripts even when build output is missing.
  return run(['run', 'prepare'], directory)
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
      'Usage: npm run setup [-- --tools-only]\nDownloads the pinned local tools and installs this checkout with pnpm.\n-h, --help  Show this help without downloading tools.\n--tools-only  Install the pinned tools without installing dependencies.',
    )
    return { status: 0, signal: null }
  }
  log(setupNotice())
  return run(values['tools-only'])
}

if (isMainModule(import.meta.url)) {
  const result = await main()
  if (result.signal) {
    process.kill(process.pid, result.signal)
  } else {
    process.exitCode = result.status ?? 1
  }
}
