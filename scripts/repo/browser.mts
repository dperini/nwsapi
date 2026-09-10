import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { Browser, computeExecutablePath, install } from '@puppeteer/browsers'
import { isMainModule } from './lib/run-node.mts'

// Updating this pin changes the browser used by WPT, browser tests, and benchmarks.
export const CHROME_VERSION = '153.0.8010.12'
export const browserInstallOptions = {
  browser: Browser.CHROME,
  buildId: CHROME_VERSION,
  cacheDir: path.join(os.homedir(), '.cache', 'nwsapi', 'browsers'),
}
let checkedExecutable: string | undefined

export function browserLaunchOptions() {
  if (!checkedExecutable) {
    const executablePath = computeExecutablePath(browserInstallOptions)
    if (!existsSync(executablePath)) {
      throw new Error(
        'Chrome for Testing is missing. Run pnpm run setup:browser.',
      )
    }
    const version = execFileSync(executablePath, ['--version'], {
      encoding: 'utf8',
      timeout: 10_000,
    }).trim()
    if (version.split(' ').at(-1) !== CHROME_VERSION) {
      throw new Error(`Expected Chrome ${CHROME_VERSION}, received ${version}.`)
    }
    checkedExecutable = executablePath
  }
  return { executablePath: checkedExecutable }
}

export async function installBrowser() {
  const installed = await install(browserInstallOptions)
  console.log(
    `Chrome for Testing ${CHROME_VERSION}: ${installed.executablePath}`,
  )
}

if (isMainModule(import.meta.url)) {
  await installBrowser()
}
