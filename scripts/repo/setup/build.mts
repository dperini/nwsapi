import { existsSync } from 'node:fs'
import path from 'node:path'
import { outputs } from '../../../.config/build.config.mts'
import { hostAssetFiles } from '../cli/ui/asset-manifest.mts'
import { currentOpenTuiTarget } from '../cli/ui/target.mts'

export function buildRequiredFiles(target = currentOpenTuiTarget()) {
  return [...outputs.map(output => ({ output })), ...hostAssetFiles(target)]
}

export function buildReadiness(
  root: string,
  exists = existsSync,
  target = currentOpenTuiTarget(),
) {
  const required = buildRequiredFiles(target)
  const missing = required.filter(file => !exists(path.join(root, file.output)))
  return {
    ready: missing.length === 0,
    issues: missing.map(
      file => 'Required build output is missing: ' + file.output + '.',
    ),
  }
}
