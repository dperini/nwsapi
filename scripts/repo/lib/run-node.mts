import { realpathSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { REPO_ROOT } from './paths.mts'

export function runNode(entry: string, args: string[] = []) {
  execFileSync(process.execPath, [entry, ...args], {
    cwd: REPO_ROOT,
    stdio: 'inherit',
  })
}

export function isMainModule(url: string, entry = process.argv[1]) {
  if (!entry) {
    return false
  }
  const modulePath = fileURLToPath(url)
  try {
    return realpathSync(entry) === realpathSync(modulePath)
  } catch {
    return entry === modulePath
  }
}
