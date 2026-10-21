import { isMainModule } from './lib/paths.mts'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { parseArgs } from 'node:util'
import { setupPhase } from './setup/progress.mts'
import { REPO_ROOT, toolVersion } from './lib/external-tools.mjs'
import { managedEnvironment, setupTools } from './lib/tools/setup.mjs'

export async function bootstrap(
  {
    toolsOnly = false,
    prepare = false,
    full = false,
    log = console.log,
    save = undefined,
  } = {},
  setup = setupTools,
  run = spawnSync,
) {
  const retry =
    'node scripts/setup.mjs' +
    (full ? ' --full' : toolsOnly ? ' --tools-only' : '')
  const tools = await setupPhase(
    '1. Verify pinned checkout tools',
    setup,
    log,
    save,
    retry,
  )
  if (toolsOnly) {
    return { status: 0, signal: null }
  }
  const options = {
    cwd: REPO_ROOT,
    env: managedEnvironment(),
    stdio: 'inherit',
  }
  if (!prepare) {
    // Complete the install before running setup, avoiding a nested install hook.
    const result = await setupPhase(
      '2. Install locked npm dependencies',
      () => {
        const installation = run(
          tools.node,
          [tools.npm, 'ci', '--ignore-scripts'],
          options,
        )
        if (installation.error) {
          throw installation.error
        }
        return installation
      },
      log,
      save,
      retry,
    )
    if (result.error) {
      throw result.error
    }
    if (result.status !== 0 || result.signal) {
      return result
    }
  }
  const script = full ? 'scripts/setup/run.mjs' : 'scripts/setup/prepare.mts'
  const result = await setupPhase(
    (prepare ? '2. Prepare ' : '3. Prepare ') +
      (full ? 'browser fixtures' : 'core checkout'),
    () => {
      const preparation = run(
        tools.node,
        [path.join(REPO_ROOT, script)],
        options,
      )
      if (preparation.error) {
        throw preparation.error
      }
      return preparation
    },
    log,
    save,
    retry,
  )
  if (result.error) {
    throw result.error
  }
  return result
}

if (isMainModule(import.meta.url)) {
  const args = process.argv.slice(2)
  const { values } = parseArgs({
    args: args[0] === '--' ? args.slice(1) : args,
    options: {
      help: { type: 'boolean', short: 'h' },
      'tools-only': { type: 'boolean' },
      full: { type: 'boolean' },
    },
  })
  if (values.help) {
    console.log(
      'Usage: node scripts/setup.mjs [--tools-only] [--full]\nInstalls the pinned local tools and sets up this checkout with npm.\n-h, --help  Show help.\n--tools-only  Provision tools without installing dependencies.\n--full  Also prepare PHP, WPT, and Chromium.',
    )
  } else {
    console.log(`Setting up this checkout with npm ${toolVersion('npm')}.`)
    const result = await bootstrap({
      toolsOnly: values['tools-only'],
      full: values.full,
      prepare: process.env.npm_lifecycle_event === 'prepare',
    })
    if (result.signal) {
      process.kill(process.pid, result.signal)
    } else {
      process.exitCode = result.status ?? 1
    }
  }
}
