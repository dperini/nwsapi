import { realpathSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { REPO_ROOT } from './paths.mts'
import { toolProcess } from './tool-process.mts'

export function runNode(entry: string, args: string[] = []) {
  const request = toolProcess([entry, ...args])
  try {
    execFileSync(request.command, request.args, {
      ...request.options,
      cwd: REPO_ROOT,
      stdio: 'inherit',
    })
  } finally {
    request.dispose()
  }
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
