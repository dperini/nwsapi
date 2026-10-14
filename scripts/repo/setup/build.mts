import { existsSync } from 'node:fs'
import path from 'node:path'
import { packageFiles } from '../../../.config/build.config.mts'

export function buildReadiness(root: string, exists = existsSync) {
  const missing = packageFiles.filter(
    file => !exists(path.join(root, file.output)),
  )
  return {
    ready: missing.length === 0,
    issues: missing.map(
      file => 'Required build output is missing: ' + file.output + '.',
    ),
  }
}
