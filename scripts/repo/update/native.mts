import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import {
  checkNativeContract,
  nativeCachePath,
} from '../check/wpt/native-contract.mts'
import { nativePins, type NativePins } from '../check/wpt/native-pool.mts'
import { REPO_ROOT } from '../lib/paths.mts'
import { isMainModule, runNode } from '../lib/run-node.mts'

export function nativeRefreshArgs(
  pins: NativePins,
  cached: { browser: string; revision: string; directory: string } | undefined,
  exists = existsSync,
) {
  return cached &&
    cached.browser === pins.browser &&
    cached.revision === pins.revision &&
    exists(path.join(cached.directory, 'report.json'))
    ? ['--resume', '--directory', cached.directory]
    : []
}

export function updateNative(
  check: boolean,
  validate = checkNativeContract,
  run = runNode,
) {
  try {
    validate()
    return
  } catch (error) {
    console.log(String(error))
  }
  if (check) {
    console.log(
      'A changed native contract requires cached results or a new candidate run. See the generated run estimate in docs/repo/testing/wpt-inventory.md.',
    )
    return
  }
  const cached = existsSync(nativeCachePath)
    ? JSON.parse(readFileSync(nativeCachePath, 'utf8'))
    : undefined
  run(
    path.join(REPO_ROOT, 'scripts/repo/check/wpt/native-run.mts'),
    nativeRefreshArgs(nativePins(), cached),
  )
  validate()
}

if (isMainModule(import.meta.url)) {
  if (process.argv.slice(2).some(arg => arg !== '--check')) {
    throw new Error('Usage: update/native.mts [--check]')
  }
  updateNative(process.argv.includes('--check'))
}
