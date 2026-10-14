import { createHash } from 'node:crypto'
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rename,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { expect, test, vi } from 'vitest'
import { nativeNoticeNames } from '../../../../../../scripts/repo/cli/ui/asset-manifest.mts'
import { cachedNativePackage } from '../../../../../../scripts/repo/cli/ui/native/package-cache.mts'

function nativePackageFixture() {
  const bytes = Buffer.from('authenticated native package archive')
  return {
    bytes,
    entry: {
      packageName: '@opentui/core-linux-x64',
      fileName: 'libopentui.so',
      integrity: `sha512-${createHash('sha512').update(bytes).digest('base64')}`,
    },
    unpackArchive: async (_archive: string, destination: string) => {
      const packageRoot = path.join(destination, 'package')
      await mkdir(packageRoot)
      await writeFile(path.join(packageRoot, 'libopentui.so'), 'native-library')
      for (const name of nativeNoticeNames) {
        await writeFile(path.join(packageRoot, name), `notice:${name}`)
      }
    },
  }
}
test('native package cache replaces poisoned files and removes unexpected entries', async () => {
  const directory = await mkdtemp(
    path.join(os.tmpdir(), 'nwsapi-native-cache-'),
  )
  const fixture = nativePackageFixture()
  try {
    const nativeFile = await cachedNativePackage(directory, fixture.entry, {
      fetchArchive: async () => fixture.bytes,
      unpackArchive: fixture.unpackArchive,
    })
    const packageRoot = path.dirname(nativeFile)
    await writeFile(nativeFile, 'poisoned native library')
    await rm(path.join(packageRoot, 'LICENSE'))
    await mkdir(path.join(packageRoot, 'LICENSE'))
    await writeFile(path.join(packageRoot, 'LICENSE', 'unexpected'), 'poison')
    await writeFile(path.join(packageRoot, 'extra.bin'), 'unexpected')

    const fetchArchive = vi.fn(async () => {
      throw new Error('valid archive should be reused')
    })
    await cachedNativePackage(directory, fixture.entry, {
      fetchArchive,
      unpackArchive: fixture.unpackArchive,
    })

    expect(fetchArchive).not.toHaveBeenCalled()
    expect(await readFile(nativeFile, 'utf8')).toBe('native-library')
    expect(await readFile(path.join(packageRoot, 'LICENSE'), 'utf8')).toBe(
      'notice:LICENSE',
    )
    expect(
      await readFile(path.join(packageRoot, 'PATENTS-LIBWEBP'), 'utf8'),
    ).toBe('notice:PATENTS-LIBWEBP')
    await expect(stat(path.join(packageRoot, 'extra.bin'))).rejects.toThrow()
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test('native package cache rejects an archive integrity mismatch before extraction', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'nwsapi-native-sri-'))
  const bytes = Buffer.from('bad archive')
  const entry = {
    packageName: '@opentui/core-linux-x64',
    fileName: 'libopentui.so',
    integrity: 'sha512-pinned-value',
  }
  const unpackArchive = vi.fn(async () => {})
  try {
    await expect(
      cachedNativePackage(directory, entry, {
        fetchArchive: async () => bytes,
        unpackArchive,
      }),
    ).rejects.toThrow('integrity mismatch')
    expect(unpackArchive).not.toHaveBeenCalled()
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test('native package cache refetches a corrupted cached archive', async () => {
  const directory = await mkdtemp(
    path.join(os.tmpdir(), 'nwsapi-native-archive-'),
  )
  const fixture = nativePackageFixture()
  try {
    const nativeFile = await cachedNativePackage(directory, fixture.entry, {
      fetchArchive: async () => fixture.bytes,
      unpackArchive: fixture.unpackArchive,
    })
    const archivePath = path.join(
      path.dirname(path.dirname(nativeFile)),
      'package.tgz',
    )
    await writeFile(archivePath, 'corrupted cache archive')
    const fetchArchive = vi.fn(async () => fixture.bytes)
    await cachedNativePackage(directory, fixture.entry, {
      fetchArchive,
      unpackArchive: fixture.unpackArchive,
    })
    expect(fetchArchive).toHaveBeenCalledOnce()
    expect(await readFile(archivePath)).toEqual(fixture.bytes)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test('native package cache preserves the prior package if replacement and rollback fail', async () => {
  const directory = await mkdtemp(
    path.join(os.tmpdir(), 'nwsapi-native-rollback-'),
  )
  const fixture = nativePackageFixture()
  try {
    const nativeFile = await cachedNativePackage(directory, fixture.entry, {
      fetchArchive: async () => fixture.bytes,
      unpackArchive: fixture.unpackArchive,
    })
    await writeFile(nativeFile, 'previous package remains recoverable')
    await expect(
      cachedNativePackage(directory, fixture.entry, {
        fetchArchive: async () => fixture.bytes,
        unpackArchive: fixture.unpackArchive,
        rm: async (target, options) => {
          if (String(target).includes('extract-')) {
            throw new Error('staging cleanup failed')
          }
          await rm(target, options)
        },
        rename: async (source, destination) => {
          const from = String(source)
          const to = String(destination)
          if (
            from.includes(`${path.sep}extract-`) &&
            to.endsWith(`${path.sep}package`)
          ) {
            throw new Error('publish failed')
          }
          if (from.endsWith('.old') && to.endsWith(`${path.sep}package`)) {
            throw new Error('rollback failed')
          }
          await rename(source, destination)
        },
      }),
    ).rejects.toThrow(/Previous files remain at .*package-.*\.old/)
    const cacheRoot = path.dirname(path.dirname(nativeFile))
    const backups = (await readdir(cacheRoot)).filter(name =>
      name.endsWith('.old'),
    )
    expect(backups).toHaveLength(1)
    expect(
      await readFile(
        path.join(cacheRoot, backups[0]!, 'libopentui.so'),
        'utf8',
      ),
    ).toBe('previous package remains recoverable')
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test('native package cache reports extraction staging cleanup failure', async () => {
  const directory = await mkdtemp(
    path.join(os.tmpdir(), 'nwsapi-native-cleanup-'),
  )
  const fixture = nativePackageFixture()
  const remove = rm
  try {
    await expect(
      cachedNativePackage(directory, fixture.entry, {
        fetchArchive: async () => fixture.bytes,
        unpackArchive: fixture.unpackArchive,
        rm: async (target, options) => {
          if (String(target).includes('extract-')) {
            throw new Error('staging cleanup failed')
          }
          await remove(target, options)
        },
      }),
    ).rejects.toThrow('staging cleanup failed')
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})
