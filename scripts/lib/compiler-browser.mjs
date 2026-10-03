import { readFileSync, writeFileSync, unlinkSync } from 'node:fs'
import { dirname, resolve, join } from 'node:path'
import { randomUUID } from 'node:crypto'

export async function launchCompilerBrowser(name, browserType) {
  try { return await browserType.launch({ headless: true }) }
  catch (error) {
    if (name !== 'firefox' || process.platform !== 'darwin' || !error.message.includes('Could not find profile folder')) throw error
    // macOS 27 protects the installed Firefox application's shared data root.
    // Give the test build a separate identity; do not access the user's data.
    // https://github.com/microsoft/playwright/issues/42768
    const resources = resolve(dirname(browserType.executablePath()), '../Resources')
    const ini = join(resources, 'browser', `nwsapi-${randomUUID()}.ini`)
    const config = readFileSync(join(resources, 'application.ini'), 'utf8')
      .replace(/^Vendor=.*$/m, 'Vendor=NwsapiChecks')
      .replace(/^Name=.*$/m, 'Name=NwsapiCompilerChecks')
    writeFileSync(ini, config)
    try {
      return await browserType.launch({ headless: true, env: { ...process.env, XUL_APP_FILE: ini } })
    } finally { unlinkSync(ini) }
  }
}
