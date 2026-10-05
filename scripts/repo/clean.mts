import { execFileSync } from 'node:child_process'
import { rm } from 'node:fs/promises'
import { homedir } from 'node:os'
import path from 'node:path'
import { obsoleteOutputs } from '../../.config/build.config.mts'
import { COMPILE_CACHE_DIR, REPO_ROOT } from './lib/paths.mts'

const caches = [
  'node_modules',
  '.cache',
  '.vitiate',
  '.tmp',
  '.pnpm-store',
  'coverage',
  'dist',
  'playwright-report',
  'test-results',
]
const browserCache = path.join(homedir(), '.cache', 'nwsapi', 'browsers')
const generated = obsoleteOutputs.filter(file => !file.startsWith('dist/'))
const compileCache = path.resolve(
  REPO_ROOT,
  process.env['NODE_COMPILE_CACHE'] || COMPILE_CACHE_DIR,
)

// Remove repo-local generated state; preserve source and upstream checkouts.
await Promise.all(
  [
    ...new Set([
      ...caches.filter(file => file !== '.cache'),
      ...generated,
      browserCache,
      compileCache,
    ]),
  ].map(file =>
    rm(path.isAbsolute(file) ? file : path.join(REPO_ROOT, file), {
      force: true,
      recursive: true,
    }),
  ),
)

// Prune only store entries no project uses, then remove the repo's tool cache.
execFileSync('pnpm', ['store', 'prune'], { cwd: REPO_ROOT, stdio: 'inherit' })

await rm(path.join(REPO_ROOT, '.cache'), { force: true, recursive: true })
