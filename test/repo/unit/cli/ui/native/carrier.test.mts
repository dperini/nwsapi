import { expect, test, vi } from 'vitest'
import { loadHybridCarrier } from '../../../../../../scripts/repo/cli/ui/native/carrier.mts'

const target = { platform: 'linux', arch: 'x64', libc: 'glibc' } as const

function fileInfo(options: { file?: boolean; symlink?: boolean } = {}) {
  return {
    isFile: () => options.file ?? true,
    isDirectory: () => false,
    isSymbolicLink: () => options.symlink ?? false,
  }
}

test('missing carrier keeps the existing raw-library runtime path', async () => {
  await expect(
    loadHybridCarrier('/assets', { target, exists: () => false }),
  ).resolves.toBe(true)
})

test('carrier load failure and missing or relative library paths use fallback', async () => {
  const assetRoot = '/assets'
  const carrier = '/assets/@opentui/core-linux-x64/opentui.node'
  const setter = vi.fn()
  await expect(
    loadHybridCarrier(assetRoot, {
      target,
      exists: () => true,
      requireCarrier: () => {
        throw new Error('bad addon')
      },
      setLibraryPath: setter,
    }),
  ).resolves.toBe(false)
  for (const exports of [{}, { libraryPath: 'relative/library.so' }]) {
    await expect(
      loadHybridCarrier(assetRoot, {
        target,
        exists: () => true,
        requireCarrier: file => {
          expect(file).toBe(carrier)
          return exports
        },
        setLibraryPath: setter,
      }),
    ).resolves.toBe(false)
  }
  expect(setter).not.toHaveBeenCalled()
})

test('carrier loader rejects missing, symlink and non-file library paths', async () => {
  for (const info of [
    undefined,
    fileInfo({ file: false }),
    fileInfo({ symlink: true }),
  ]) {
    const lstat = vi.fn(async () => {
      if (!info) {
        throw new Error('missing')
      }
      return info as never
    })
    const setter = vi.fn()
    await expect(
      loadHybridCarrier('/assets', {
        target,
        exists: () => true,
        requireCarrier: () => ({ libraryPath: '/tmp/opentui.so' }),
        lstat: lstat as never,
        setLibraryPath: setter,
      }),
    ).resolves.toBe(false)
    expect(setter).not.toHaveBeenCalled()
  }
})

test('valid carrier path is installed and setter failures select fallback', async () => {
  const setter = vi.fn()
  await expect(
    loadHybridCarrier('/assets', {
      target,
      exists: () => true,
      requireCarrier: () => ({ libraryPath: '/tmp/opentui.so' }),
      lstat: vi.fn(async () => fileInfo() as never),
      setLibraryPath: setter,
    }),
  ).resolves.toBe(true)
  expect(setter).toHaveBeenCalledWith('/tmp/opentui.so')
  await expect(
    loadHybridCarrier('/assets', {
      target,
      exists: () => true,
      requireCarrier: () => ({ libraryPath: '/tmp/opentui.so' }),
      lstat: vi.fn(async () => fileInfo() as never),
      setLibraryPath: () => {
        throw new Error('set path failed')
      },
    }),
  ).resolves.toBe(false)
})
