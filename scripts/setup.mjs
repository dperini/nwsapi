import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { parseArgs } from 'node:util'
import { fileURLToPath } from 'node:url'
import { REPO_ROOT, toolVersion } from './lib/external-tools.mjs'
import { managedEnvironment, setupTools } from './lib/tools/setup.mjs'

export async function bootstrap(
  { toolsOnly = false, prepare = false } = {},
  setup = setupTools,
  run = spawnSync,
) {
  const tools = await setup()
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
    const result = run(
      tools.node,
      [tools.npm, 'ci', '--ignore-scripts'],
      options,
    )
    if (result.error) {
      throw result.error
    }
    if (result.status !== 0 || result.signal) {
      return result
    }
  }
  const result = run(
    tools.node,
    [path.join(REPO_ROOT, 'scripts/setup/run.mjs')],
    options,
  )
  if (result.error) {
    throw result.error
  }
  return result
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const args = process.argv.slice(2)
  const { values } = parseArgs({
    args: args[0] === '--' ? args.slice(1) : args,
    options: {
      help: { type: 'boolean', short: 'h' },
      'tools-only': { type: 'boolean' },
    },
  })
  if (values.help) {
    console.log(
      'Usage: npm run setup [-- --tools-only]\nInstalls the pinned local tools and sets up this checkout with npm.\n-h, --help  Show help.\n--tools-only  Provision tools without installing dependencies.',
    )
  } else {
    console.log(`Setting up this checkout with npm ${toolVersion('npm')}.`)
    const result = await bootstrap({
      toolsOnly: values['tools-only'],
      prepare: process.env.npm_lifecycle_event === 'prepare',
    })
    if (result.signal) {
      process.kill(process.pid, result.signal)
    } else {
      process.exitCode = result.status ?? 1
    }
  }
}
