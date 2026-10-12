import { existsSync, lstatSync, readdirSync, rmSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export function cleanRepository(
  root = fileURLToPath(new URL('../', import.meta.url)),
) {
  const directories = [
    'node_modules',
    'coverage',
    '.nyc_output',
    '.cache',
    'test-results',
    'playwright-report',
  ]

  for (const directory of directories) {
    rmSync(path.join(root, directory), {
      recursive: true,
      force: true,
    })
  }

  const dist = path.join(root, 'dist')
  if (existsSync(dist) && !lstatSync(dist).isSymbolicLink()) {
    for (const entry of readdirSync(dist)) {
      // The legacy build scripts expect this tracked placeholder to exist.
      if (entry !== 'lint.log') {
        rmSync(path.join(dist, entry), { recursive: true, force: true })
      }
    }
  }
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const root = fileURLToPath(new URL('../', import.meta.url))
  cleanRepository(root)

  console.log('Removed repository build and test caches.')
}
