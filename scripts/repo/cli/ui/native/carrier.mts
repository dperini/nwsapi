import { existsSync } from 'node:fs'
import { lstat } from 'node:fs/promises'
import path from 'node:path'
import { createRequire } from 'node:module'
import { nativeAssetPath } from './cache.mts'
import { currentOpenTuiTarget } from '../target.mts'
import type { OpenTuiTarget } from '../target.mts'

const require = createRequire(import.meta.url)

export type HybridCarrierExports = { libraryPath?: unknown }

async function validatedLibraryPath(
  exports: HybridCarrierExports,
  checkFile: typeof lstat,
) {
  const libraryPath = exports?.libraryPath
  if (typeof libraryPath !== 'string' || !path.isAbsolute(libraryPath)) {
    return undefined
  }
  try {
    const info = await checkFile(libraryPath)
    return info.isFile() && !info.isSymbolicLink() ? libraryPath : undefined
  } catch {
    return undefined
  }
}

async function installLibraryPath(
  libraryPath: string,
  setter: ((file: string) => void | Promise<void>) | undefined,
) {
  if (setter) {
    try {
      await setter(libraryPath)
      return true
    } catch {
      return false
    }
  }
  try {
    const { setRenderLibPath } = await import('@opentui/core')
    setRenderLibPath(libraryPath)
    return true
  } catch {
    return false
  }
}

export async function loadHybridCarrier(
  assetRoot: string,
  options: {
    target?: OpenTuiTarget
    exists?: (file: string) => boolean
    requireCarrier?: (file: string) => HybridCarrierExports
    lstat?: typeof lstat
    setLibraryPath?: (file: string) => void | Promise<void>
  } = {},
) {
  const carrier = nativeAssetPath(
    assetRoot,
    options.target ?? currentOpenTuiTarget(),
    'opentui.node',
  )
  if (!carrier || !(options.exists ?? existsSync)(carrier)) {
    return true
  }
  let loaded: HybridCarrierExports
  try {
    loaded = (options.requireCarrier ?? require)(carrier)
  } catch {
    return false
  }
  const libraryPath = await validatedLibraryPath(loaded, options.lstat ?? lstat)
  if (libraryPath === undefined) {
    return false
  }
  return installLibraryPath(libraryPath, options.setLibraryPath)
}
