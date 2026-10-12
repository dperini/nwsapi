import { readFileSync, realpathSync } from 'node:fs'
import path from 'node:path'

export function installedPackage(
  root: string,
  nodeModules: string,
  name: string,
  lockedVersion: string,
) {
  try {
    const packagePath = path.join(nodeModules, name, 'package.json')
    const actual = JSON.parse(readFileSync(packagePath, 'utf8')) as {
      version?: string
      name?: string
    }
    if (lockedVersion.startsWith('link:')) {
      const linkPath = path.resolve(root, lockedVersion.slice('link:'.length))
      const linkReal = realpathSync(path.join(nodeModules, name))
      if (linkReal !== realpathSync(linkPath)) {
        return { ready: false, issue: 'workspace link differs from lockfile.' }
      }
      if (actual.name !== name) {
        return { ready: false, issue: 'workspace package name does not match.' }
      }
      return { ready: true, issue: '' }
    }
    const expectedVersion = lockedVersion.split('(')[0]
    if (actual.version !== expectedVersion) {
      return {
        ready: false,
        issue: `expected ${expectedVersion}, found ${actual.version ?? 'missing'}.`,
      }
    }
    return { ready: true, issue: '' }
  } catch {
    return { ready: false, issue: 'package is missing or unreadable.' }
  }
}
