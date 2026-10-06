import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync, rmSync } from 'node:fs'
import { homedir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { npmInvocation } from './lib/npm.mjs'

const root = fileURLToPath(new URL('../', import.meta.url))
const directories = ['node_modules', 'coverage', '.nyc_output', '.cache', 'test-results', 'playwright-report']

for (const directory of directories) {
  rmSync(path.join(root, directory), { recursive: true, force: true })
}

const dist = path.join(root, 'dist')
if (existsSync(dist)) {
  for (const entry of readdirSync(dist)) {
    // The legacy build scripts expect this tracked placeholder to exist.
    if (entry !== 'lint.log') rmSync(path.join(dist, entry), { recursive: true, force: true })
  }
}

const playwrightCache = process.env.PLAYWRIGHT_BROWSERS_PATH
  ? process.env.PLAYWRIGHT_BROWSERS_PATH === '0'
    ? null
    : path.resolve(root, process.env.PLAYWRIGHT_BROWSERS_PATH)
  : process.platform === 'darwin'
    ? path.join(homedir(), 'Library', 'Caches', 'ms-playwright')
    : process.platform === 'win32'
      ? path.join(process.env.LOCALAPPDATA || path.join(homedir(), 'AppData', 'Local'), 'ms-playwright')
      : path.join(homedir(), '.cache', 'ms-playwright')

if (playwrightCache) rmSync(playwrightCache, { recursive: true, force: true })

const npmArgs = ['cache', 'clean', '--force']
const invocation = npmInvocation(npmArgs)
execFileSync(invocation.command, invocation.args, {
  stdio: 'inherit',
  shell: invocation.shell,
})

console.log('Removed repository build and test caches, Playwright browsers, and the npm cache.')
