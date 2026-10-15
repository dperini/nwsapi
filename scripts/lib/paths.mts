import path from 'node:path'
import { realpathSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

export const REPO_ROOT = fileURLToPath(new URL('../../', import.meta.url))
export const WIN32 = process.platform === 'win32'

export function isMainModule(url: string, entry = process.argv[1]) {
  if (!entry) {
    return false
  }
  const modulePath = fileURLToPath(url)
  try {
    return realpathSync(entry) === realpathSync(modulePath)
  } catch {
    return path.resolve(entry) === modulePath
  }
}
