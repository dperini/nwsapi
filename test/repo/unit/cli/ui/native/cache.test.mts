import { expect, test, vi } from 'vitest'
import {
  nativeAssetAvailable,
  nativeAssetPath,
  prepareNativeCache,
} from '../../../../../../scripts/repo/cli/ui/native/cache.mts'
import type { NativeFileSystem } from '../../../../../../scripts/repo/cli/ui/native/cache.mts'

const target = { platform: 'linux', arch: 'x64', libc: 'glibc' } as const

test('native carrier paths follow the selected platform and support raw assets', () => {
  expect(nativeAssetPath('/assets', target)).toBe(
    '/assets/@opentui/core-linux-x64/opentui.node',
  )
  expect(
    nativeAssetAvailable('/assets', target, file =>
      file.endsWith('libopentui.so'),
    ),
  ).toBe(true)
  expect(
    nativeAssetAvailable('/assets', target, file =>
      file.endsWith('opentui.dll'),
    ),
  ).toBe(false)
  expect(
    nativeAssetAvailable('/assets', target, file =>
      file.endsWith('opentui.node'),
    ),
  ).toBe(true)
  expect(nativeAssetAvailable('/assets', target, () => false)).toBe(false)
})

test('carrier cache is isolated, permission checked and cleaned after use', async () => {
  const filesystem = {
    mkdtemp: vi.fn(async () => '/tmp/nwsapi-opentui-abc'),
    lstat: vi.fn(async () => ({
      isDirectory: () => true,
      isSymbolicLink: () => false,
      uid: process.getuid?.(),
    })),
    chmod: vi.fn(async () => {}),
    stat: vi.fn(async () => ({ mode: 0o700 })),
    rm: vi.fn(async () => {}),
  } as unknown as NativeFileSystem
  const cache = await prepareNativeCache('/assets', {
    target,
    tempDirectory: '/tmp',
    platform: 'linux',
    exists: () => true,
    fileSystem: filesystem,
  })
  expect(cache.env).toEqual({
    TMPDIR: '/tmp/nwsapi-opentui-abc',
    TMP: '/tmp/nwsapi-opentui-abc',
    TEMP: '/tmp/nwsapi-opentui-abc',
  })
  expect(filesystem.chmod).toHaveBeenCalledWith(
    '/tmp/nwsapi-opentui-abc',
    0o700,
  )
  await cache.cleanup()
  expect(filesystem.rm).toHaveBeenCalledWith('/tmp/nwsapi-opentui-abc', {
    recursive: true,
    force: true,
  })
})

test('carrier cache rejects a symlink root and removes it', async () => {
  const filesystem = {
    mkdtemp: vi.fn(async () => '/tmp/nwsapi-opentui-abc'),
    lstat: vi.fn(async () => ({
      isDirectory: () => true,
      isSymbolicLink: () => true,
    })),
    chmod: vi.fn(async () => {}),
    stat: vi.fn(async () => ({ mode: 0o700 })),
    rm: vi.fn(async () => {}),
  } as unknown as NativeFileSystem
  await expect(
    prepareNativeCache('/assets', {
      target,
      exists: () => true,
      fileSystem: filesystem,
    }),
  ).rejects.toThrow('real directory')
  expect(filesystem.rm).toHaveBeenCalledWith('/tmp/nwsapi-opentui-abc', {
    recursive: true,
    force: true,
  })
})

test('carrier cache rejects a root owned by another user', async () => {
  const filesystem = {
    mkdtemp: vi.fn(async () => '/tmp/nwsapi-opentui-abc'),
    lstat: vi.fn(async () => ({
      isDirectory: () => true,
      isSymbolicLink: () => false,
      uid: 42,
    })),
    chmod: vi.fn(async () => {}),
    stat: vi.fn(async () => ({ mode: 0o700 })),
    rm: vi.fn(async () => {}),
  } as unknown as NativeFileSystem
  await expect(
    prepareNativeCache('/assets', {
      target,
      platform: 'linux',
      getuid: () => 12,
      exists: () => true,
      fileSystem: filesystem,
    }),
  ).rejects.toThrow('current user')
  expect(filesystem.rm).toHaveBeenCalledWith('/tmp/nwsapi-opentui-abc', {
    recursive: true,
    force: true,
  })
})
