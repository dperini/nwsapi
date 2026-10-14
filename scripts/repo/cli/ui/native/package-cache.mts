import { createHash, randomUUID } from 'node:crypto'
import {
  lstat,
  mkdtemp,
  mkdir,
  readdir,
  readFile,
  readlink,
  rename,
  rm,
  writeFile,
} from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { OPENTUI_VERSION, packageTarballUrl } from '../asset-manifest.mts'

export type NativePackageSpec = {
  packageName: string
  fileName: string
  integrity: string
}

export type NativePackageCacheAdapters = {
  fetchArchive: (url: string) => Promise<Buffer>
  unpackArchive: (archive: string, destination: string) => Promise<void>
  readFile: typeof readFile
  writeFile: typeof writeFile
  mkdir: typeof mkdir
  mkdtemp: typeof mkdtemp
  rename: typeof rename
  rm: typeof rm
  readdir: typeof readdir
  lstat: typeof lstat
  readlink: typeof readlink
}

const nativePackageCacheAdapters: NativePackageCacheAdapters = {
  fetchArchive: async url => {
    const response = await fetch(url)
    if (!response.ok) {
      throw new Error(
        `Could not fetch OpenTUI asset archive: HTTP ${response.status}.`,
      )
    }
    return Buffer.from(await response.arrayBuffer())
  },
  unpackArchive: async (archive, destination) => {
    const result = spawnSync('tar', ['-xzf', archive, '-C', destination], {
      stdio: 'inherit',
    })
    if (result.status !== 0) {
      throw new Error('Could not unpack OpenTUI asset archive.')
    }
  },
  readFile,
  writeFile,
  mkdir,
  mkdtemp,
  rename,
  rm,
  readdir,
  lstat,
  readlink,
}

type PackageTreeEntry = {
  kind: string
  mode: number
  contents?: Buffer | string
}

async function packageTree(root: string, io: NativePackageCacheAdapters) {
  const entries = new Map<string, PackageTreeEntry>()
  const rootInfo = await io.lstat(root)
  if (!rootInfo.isDirectory() || rootInfo.isSymbolicLink()) {
    throw new Error('OpenTUI package cache entry must be a real directory.')
  }
  const visit = async (directory: string, prefix = '') => {
    for (const name of await io.readdir(directory)) {
      const relative = prefix ? `${prefix}/${name}` : name
      const absolute = path.join(directory, name)
      const info = await io.lstat(absolute)
      if (info.isDirectory()) {
        entries.set(relative, { kind: 'directory', mode: info.mode & 0o777 })
        await visit(absolute, relative)
      } else if (info.isFile()) {
        entries.set(relative, {
          kind: 'file',
          mode: info.mode & 0o777,
          contents: await io.readFile(absolute),
        })
      } else if (info.isSymbolicLink()) {
        entries.set(relative, {
          kind: 'symlink',
          mode: info.mode & 0o777,
          contents: await io.readlink(absolute),
        })
      } else {
        entries.set(relative, { kind: 'special', mode: info.mode & 0o777 })
      }
    }
  }
  await visit(root)
  return entries
}

async function packageTreesEqual(
  current: string,
  authenticated: string,
  io: NativePackageCacheAdapters,
) {
  const right = await packageTree(authenticated, io)
  let left: Map<string, PackageTreeEntry>
  try {
    left = await packageTree(current, io)
  } catch {
    return false
  }
  if (left.size !== right.size) {
    return false
  }
  for (const [name, expected] of right) {
    const actual = left.get(name)
    if (
      !actual ||
      actual.kind !== expected.kind ||
      actual.mode !== expected.mode ||
      (Buffer.isBuffer(expected.contents)
        ? !Buffer.isBuffer(actual.contents) ||
          !actual.contents.equals(expected.contents)
        : actual.contents !== expected.contents)
    ) {
      return false
    }
  }
  return true
}

async function verifiedNativeArchive(
  archive: string,
  entry: NativePackageSpec,
  io: NativePackageCacheAdapters,
) {
  try {
    const bytes = await io.readFile(archive)
    assertAssetArchiveIntegrity(bytes, entry.integrity)
    return bytes
  } catch {
    const bytes = await io.fetchArchive(packageTarballUrl(entry.packageName))
    assertAssetArchiveIntegrity(bytes, entry.integrity)
    const temporary = `${archive}.${randomUUID()}.tmp`
    try {
      await io.writeFile(temporary, bytes, { flag: 'wx' })
      await io.rename(temporary, archive)
    } finally {
      await io.rm(temporary, { force: true })
    }
    return bytes
  }
}

async function replacePackageTree(
  staged: string,
  packageRoot: string,
  cache: string,
  io: NativePackageCacheAdapters,
) {
  const backup = path.join(cache, `package-${randomUUID()}.old`)
  let backedUp = false
  let installed = false
  let keepBackup = false
  try {
    try {
      await io.rename(packageRoot, backup)
      backedUp = true
    } catch (error) {
      if (!isMissingPath(error)) {
        throw error
      }
    }
    await io.rename(staged, packageRoot)
    installed = true
    if (backedUp) {
      try {
        await io.rm(backup, { recursive: true, force: true })
      } catch (error) {
        keepBackup = true
        throw new Error(
          `Could not remove previous OpenTUI package cache at ${backup}.`,
          { cause: error },
        )
      }
      backedUp = false
    }
  } catch (error) {
    if (backedUp && !installed) {
      try {
        await io.rename(backup, packageRoot)
        backedUp = false
      } catch (rollbackError) {
        keepBackup = true
        throw new Error(
          `Could not restore OpenTUI package cache. Previous files remain at ${backup}.`,
          { cause: rollbackError },
        )
      }
    } else if (backedUp) {
      keepBackup = true
    }
    throw error
  } finally {
    if (backedUp && !keepBackup) {
      await io.rm(backup, { recursive: true, force: true })
    }
  }
}

function isMissingPath(error: unknown) {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 'ENOENT'
  )
}

async function installNativePackage(
  cache: string,
  packageRoot: string,
  entry: NativePackageSpec,
  bytes: Buffer,
  io: NativePackageCacheAdapters,
) {
  const temporary = await io.mkdtemp(path.join(cache, 'extract-'))
  let primaryError: unknown
  let hasPrimaryError = false
  try {
    const verifiedArchive = path.join(temporary, 'package.tgz')
    const stagedPackage = path.join(temporary, 'package')
    await io.writeFile(verifiedArchive, bytes, { flag: 'wx' })
    await io.unpackArchive(verifiedArchive, temporary)
    const stagedNative = await io.lstat(
      path.join(stagedPackage, entry.fileName),
    )
    if (!stagedNative.isFile() || stagedNative.isSymbolicLink()) {
      throw new Error('OpenTUI package archive has no regular native library.')
    }
    if (!(await packageTreesEqual(packageRoot, stagedPackage, io))) {
      await replacePackageTree(stagedPackage, packageRoot, cache, io)
    }
  } catch (error) {
    primaryError = error
    hasPrimaryError = true
  }
  let cleanupError: unknown
  let hasCleanupError = false
  try {
    await io.rm(temporary, { recursive: true, force: true })
  } catch (error) {
    cleanupError = error
    hasCleanupError = true
  }
  if (hasPrimaryError && hasCleanupError) {
    const details =
      primaryError instanceof Error
        ? primaryError.message
        : String(primaryError)
    throw new AggregateError(
      [primaryError, cleanupError],
      `${details} Temporary OpenTUI package staging cleanup also failed.`,
      { cause: primaryError },
    )
  }
  if (hasPrimaryError) {
    throw primaryError
  }
  if (hasCleanupError) {
    throw cleanupError
  }
}

export async function cachedNativePackage(
  root: string,
  entry: NativePackageSpec,
  adapters: Partial<NativePackageCacheAdapters> = {},
) {
  const io = { ...nativePackageCacheAdapters, ...adapters }
  const pin = createHash('sha256')
    .update(entry.integrity)
    .digest('hex')
    .slice(0, 16)
  const cacheId = `${OPENTUI_VERSION}-${pin}`
  const cache = path.join(
    root,
    '.cache/repo/opentui',
    entry.packageName,
    cacheId,
  )
  const packageRoot = path.join(cache, 'package')
  const nativeFile = path.join(packageRoot, entry.fileName)
  await io.mkdir(cache, { recursive: true })
  const archive = path.join(cache, 'package.tgz')
  const bytes = await verifiedNativeArchive(archive, entry, io)
  await installNativePackage(cache, packageRoot, entry, bytes, io)
  return nativeFile
}

export function assertAssetArchiveIntegrity(bytes: Buffer, expected: string) {
  const actual = `sha512-${createHash('sha512').update(bytes).digest('base64')}`
  if (actual !== expected) {
    throw new Error(`OpenTUI asset archive integrity mismatch: ${expected}.`)
  }
}
