import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { Browser, computeExecutablePath, install } from '@puppeteer/browsers'
import { parseArgs } from 'node:util'
import { isMainModule } from './lib/run-node.mts'

// Updating this pin changes the browser used by WPT, browser tests, and benchmarks.
export const CHROME_VERSION: string = JSON.parse(
  readFileSync(new URL('../../.config/chrome.json', import.meta.url), 'utf8'),
).version
export const browserInstallOptions = {
  browser: Browser.CHROME,
  buildId: CHROME_VERSION,
  cacheDir: path.join(os.homedir(), '.cache', 'nwsapi', 'browsers'),
}
export const WEBMCP_LAUNCH_ARGS = ['--enable-features=WebMCPTesting']
let checkedExecutable: string | undefined

export function browserLaunchOptions(
  extraArgs: string[] = [],
  executableOverride?: string,
) {
  let executablePath = executableOverride
  if (!executablePath) {
    if (!checkedExecutable) {
      const pinnedExecutable = computeExecutablePath(browserInstallOptions)
      if (!existsSync(pinnedExecutable)) {
        throw new Error(
          'Chrome for Testing is missing. Run pnpm run setup:browser.',
        )
      }
      const version = execFileSync(pinnedExecutable, ['--version'], {
        encoding: 'utf8',
        timeout: 10_000,
      }).trim()
      if (version.split(' ').at(-1) !== CHROME_VERSION) {
        throw new Error(
          `Expected Chrome ${CHROME_VERSION}, received ${version}.`,
        )
      }
      checkedExecutable = pinnedExecutable
    }
    executablePath = checkedExecutable
  }
  return {
    executablePath,
    args: [...WEBMCP_LAUNCH_ARGS, ...extraArgs],
  }
}

export async function installBrowser() {
  const installed = await install(browserInstallOptions)
  console.log(
    `Chrome for Testing ${CHROME_VERSION}: ${installed.executablePath}`,
  )
}

export function browserInstallPlan() {
  return {
    schemaVersion: 1,
    type: 'preview',
    command: 'setup/browser',
    version: CHROME_VERSION,
    cache: browserInstallOptions.cacheDir,
    executable: computeExecutablePath(browserInstallOptions),
  }
}

export function describeBrowserSetup() {
  return {
    schemaVersion: 1,
    type: 'command',
    name: 'setup/browser',
    description: 'Install the pinned Chrome for Testing build.',
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
    console.log(`Usage: pnpm run setup:browser
Installs the pinned Chrome for Testing release used by browser tests, WPT, and benchmarks.
-h, --help  Show this help without installing Chrome.`)
    return
  }
  if (values.describe) {
    const description = describeBrowserSetup()
    console.log(
      values.json ? JSON.stringify(description) : description.description,
    )
    return
  }
  if (values['dry-run']) {
    const plan = browserInstallPlan()
    console.log(
      values.json
        ? JSON.stringify(plan)
        : `Would install Chrome ${plan.version}:\n  cache: ${plan.cache}\n  executable: ${plan.executable}`,
    )
    return
  }
  await installBrowser()
}

if (isMainModule(import.meta.url)) {
  await main()
}
