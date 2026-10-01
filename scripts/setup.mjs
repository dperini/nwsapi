import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { setupRelease } from './publish/setup.mjs'

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
const root = fileURLToPath(new URL('../', import.meta.url))
const env = Object.fromEntries(Object.entries({ ...process.env, GIT_TERMINAL_PROMPT: '0' })
  .filter(([name]) => !/^npm_config_python$/i.test(name)))
runQuiet(process.execPath, [fileURLToPath(new URL('../test/wpt/wpt-launcher.mjs', import.meta.url)), 'setup'], { cwd: root, env })

const npmArgs = [
  'exec', '--yes', '--silent',
  '--userconfig', path.join(root, '.npmrc'),
  '--globalconfig', path.join(root, '.npmrc'),
  '--', 'playwright', 'install', 'chromium',
]
if (process.env.npm_execpath) {
  runQuiet(process.execPath, [process.env.npm_execpath, ...npmArgs], { cwd: root, env })
} else {
  runQuiet(process.platform === 'win32' ? 'npm.cmd' : 'npm', npmArgs, {
    cwd: root,
    env,
    shell: process.platform === 'win32',
  })
}
