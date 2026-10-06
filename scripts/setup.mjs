import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { setupRelease } from './publish/setup.mjs'
import { ensurePhp } from './php.mjs'
import { npmInvocation } from './lib/npm.mjs'

function runQuiet(command, args, options = {}) {
  try {
    execFileSync(command, args, { ...options, encoding: 'utf8', stdio: 'pipe' })
  } catch (error) {
    if (error.stdout) process.stderr.write(error.stdout)
    if (error.stderr) process.stderr.write(error.stderr)
    throw error
  }
}

setupRelease()
ensurePhp()
const root = fileURLToPath(new URL('../', import.meta.url))
const env = Object.fromEntries(Object.entries({ ...process.env, GIT_TERMINAL_PROMPT: '0' })
  .filter(([name]) => !/^npm_config_python$/i.test(name)))
runQuiet(process.execPath, [fileURLToPath(new URL('../test/wpt/wpt-launcher.mjs', import.meta.url)), 'setup'], { cwd: root, env })

const configDirectory = mkdtempSync(path.join(os.tmpdir(), 'nwsapi-npm-config-'))
const globalConfig = path.join(configDirectory, 'global.npmrc')
writeFileSync(globalConfig, '')
try {
  const npmArgs = [
    'exec', '--yes', '--silent',
    '--globalconfig', globalConfig,
    '--', 'playwright', 'install', 'chromium',
  ]
  const invocation = npmInvocation(npmArgs)
  runQuiet(invocation.command, invocation.args, {
    cwd: root,
    env,
    shell: invocation.shell,
  })
} finally {
  rmSync(configDirectory, { recursive: true, force: true })
}
