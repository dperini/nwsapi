import { fileURLToPath } from 'node:url'

export const root = fileURLToPath(new URL('../../', import.meta.url))

export function setupRelease() {
  const [major, minor, patch] = process.versions.node.split('.').map(Number)
  if (!(major >= 26 || major === 24 && minor >= 15 || major === 22 && (minor > 22 || minor === 22 && patch >= 2))) {
    throw new Error('Contributor tooling requires Node 22.22.2+, 24.15.0+, or 26+. The published runtime requirements are unchanged.')
  }
  if (!['prepare', 'setup'].includes(process.env.npm_lifecycle_event)) {
    console.log('Publish tooling ready. See docs/releases.md for the one-time trusted-publisher setup.')
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) setupRelease()
