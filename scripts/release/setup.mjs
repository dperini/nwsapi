import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
export const root = fileURLToPath(new URL('../../', import.meta.url))
export const npmCli = fileURLToPath(new URL('../../node_modules/npm/bin/npm-cli.js', import.meta.url))

export function setupRelease() {
  const expected = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url))).devDependencies.npm
  const installed = require('npm/package.json')
  if (installed.version !== expected) throw new Error(`Run pnpm install: release tooling requires npm ${expected}.`)
  const [major, minor, patch] = process.versions.node.split('.').map(Number)
  if (!(major >= 26 || major === 24 && minor >= 15 || major === 22 && (minor > 22 || minor === 22 && patch >= 2))) {
    throw new Error('Contributor tooling requires Node 22.22.2+, 24.15.0+, or 26+. The published runtime requirements are unchanged.')
  }
  readFileSync(npmCli)
  console.log(`Release tooling ready (npm ${installed.version}). See docs/releases.md for the one-time trusted-publisher setup.`)
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) setupRelease()
