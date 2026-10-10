import {
  chmodSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  realpathSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import path from 'node:path'
import { TOOL_CACHE, toolDirectory } from '../external-tools.mjs'

import { extractArchive, matchesArchive } from './archive.mjs'
import { downloadArchive } from './download.mjs'

export function stageTool(plan, bytes, staging) {
  if (plan.format === 'binary') {
    const binary = path.join(staging, plan.binary)
    mkdirSync(path.dirname(binary), { recursive: true })
    writeFileSync(binary, bytes, { mode: 0o600, flag: 'wx' })
    return
  }
  const archive = path.join(staging, plan.asset)
  writeFileSync(archive, bytes, { mode: 0o600, flag: 'wx' })
  extractArchive(plan.asset, staging)
  rmSync(archive)
}

export async function installTool(plan, cache = TOOL_CACHE, request = fetch) {
  const bytes = await downloadArchive(
    plan.url,
    plan.integrity,
    path.join(cache, 'archives'),
    request,
  )
  const target = toolDirectory(plan, cache)
  const parent = path.dirname(target)
  mkdirSync(parent, { recursive: true })
  const staging = mkdtempSync(path.join(parent, '.install-'))
  try {
    stageTool(plan, bytes, staging)
    const executable = path.join(staging, plan.binary)
    if (
      !lstatSync(executable).isFile() ||
      !realpathSync(executable).startsWith(realpathSync(staging) + path.sep)
    ) {
      throw new Error(`Invalid executable in ${plan.asset}: ${plan.binary}`)
    }
    chmodSync(executable, 0o755)
    // Compare cached files with a fresh installation of the verified download.
    if (!matchesArchive(target, staging)) {
      rmSync(target, { recursive: true, force: true })
      renameSync(staging, target)
    }
    console.log(`Verified ${plan.name} ${plan.version}: ${plan.asset}`)
    return path.join(target, plan.binary)
  } finally {
    rmSync(staging, { recursive: true, force: true })
  }
}
