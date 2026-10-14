import { existsSync } from 'node:fs'
import { chmod, lstat, mkdtemp, rm, stat } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { nativeAssetPackages } from '../asset-manifest.mts'
import { currentOpenTuiTarget } from '../target.mts'
import type { OpenTuiTarget } from '../target.mts'

export type NativeFileSystem = {
  lstat: typeof lstat
  stat: typeof stat
  mkdtemp: typeof mkdtemp
  chmod: typeof chmod
  rm: typeof rm
}

export type NativeCache = {
  env: NodeJS.ProcessEnv
  cleanup: () => Promise<void>
}

export function nativeAssetPath(
  assetRoot: string,
  target: OpenTuiTarget = currentOpenTuiTarget(),
  fileName:
    | 'opentui.node'
    | 'libopentui.dylib'
    | 'libopentui.so'
    | 'opentui.dll' = 'opentui.node',
) {
  const suffix = target.libc === 'musl' ? '-musl' : ''
  const packageName = `@opentui/core-${target.platform}-${target.arch}${suffix}`
  if (!nativeAssetPackages.some(entry => entry.packageName === packageName)) {
    return undefined
  }
  return path.join(assetRoot, packageName, fileName)
}

export function nativeAssetAvailable(
  assetRoot: string,
  target: OpenTuiTarget = currentOpenTuiTarget(),
  exists: (file: string) => boolean = existsSync,
) {
  const carrier = nativeAssetPath(assetRoot, target, 'opentui.node')
  const packageName = `@opentui/core-${target.platform}-${target.arch}${target.libc === 'musl' ? '-musl' : ''}`
  const raw = nativeAssetPackages.find(
    entry => entry.packageName === packageName,
  )
  const library = raw
    ? nativeAssetPath(assetRoot, target, raw.fileName)
    : undefined
  return [carrier, library].some(file => file !== undefined && exists(file))
}

async function secureCacheRoot(
  root: string,
  platform: NodeJS.Platform,
  getuid: (() => number | undefined) | undefined,
  fs: NativeFileSystem,
) {
  const info = await fs.lstat(root)
  if (!info.isDirectory() || info.isSymbolicLink()) {
    throw new Error('OpenTUI cache root must be a real directory.')
  }
  if (platform === 'win32') {
    return
  }
  const owner = getuid?.() ?? process.getuid?.()
  if (owner !== undefined && info.uid !== owner) {
    throw new Error('OpenTUI cache root must belong to the current user.')
  }
  await fs.chmod(root, 0o700)
  const verified = await fs.stat(root)
  if ((verified.mode & 0o777) !== 0o700) {
    throw new Error('OpenTUI cache root permissions must be 0700.')
  }
}

export async function prepareNativeCache(
  assetRoot: string,
  options: {
    target?: OpenTuiTarget
    tempDirectory?: string
    exists?: (file: string) => boolean
    fileSystem?: NativeFileSystem
    platform?: NodeJS.Platform
    getuid?: () => number | undefined
  } = {},
): Promise<NativeCache> {
  const target = options.target ?? currentOpenTuiTarget()
  const carrier = nativeAssetPath(assetRoot, target, 'opentui.node')
  const exists = options.exists ?? existsSync
  if (!carrier || !exists(carrier)) {
    return { env: {}, cleanup: async () => {} }
  }

  const fs = options.fileSystem ?? { lstat, stat, mkdtemp, chmod, rm }
  const base = options.tempDirectory ?? os.tmpdir()
  const root = await fs.mkdtemp(path.join(base, 'nwsapi-opentui-'))
  try {
    await secureCacheRoot(
      root,
      options.platform ?? process.platform,
      options.getuid,
      fs,
    )
  } catch (error) {
    await fs.rm(root, { recursive: true, force: true })
    throw error
  }
  return {
    env: { TMPDIR: root, TMP: root, TEMP: root },
    cleanup: () => fs.rm(root, { recursive: true, force: true }),
  }
}
