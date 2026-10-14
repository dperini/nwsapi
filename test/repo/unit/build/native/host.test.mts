import { expect, test, vi } from 'vitest'
import type { NativeSpawn } from '../../../../../scripts/repo/build/native/host.mts'
import {
  nativeCacheSize,
  runNativeCommand,
} from '../../../../../scripts/repo/build/native/host.mts'

test('runs a native packaging command with its working directory and merged environment', () => {
  const spawn = vi.fn<NativeSpawn>(() => ({
    status: 0,
    stdout: 'done\n',
    stderr: '',
  }))
  expect(
    runNativeCommand(
      '/tools/abi',
      ['pack-ffi', 'library.dylib'],
      '/checkout',
      { CARRIER: '1' },
      spawn,
    ),
  ).toBe('done')
  expect(spawn).toHaveBeenCalledWith(
    '/tools/abi',
    ['pack-ffi', 'library.dylib'],
    expect.objectContaining({
      cwd: '/checkout',
      env: expect.objectContaining({ CARRIER: '1' }),
      encoding: 'utf8',
    }),
  )
})

test('surfaces native tool failure details', () => {
  const spawn = vi.fn<NativeSpawn>(() => ({
    status: 101,
    stdout: '',
    stderr: 'link error',
  }))
  expect(() =>
    runNativeCommand('/tools/abi', ['pack-ffi'], '/checkout', {}, spawn),
  ).toThrow('link error')
})

test('measures logical and allocated cache bytes from filesystem metadata', () => {
  const stat = vi.fn((_filename: string) => ({ size: 4096, blocks: 16 }))
  expect(nativeCacheSize('/private/cache/library.dylib', stat)).toEqual({
    logicalBytes: 4096,
    physicalBytes: 8192,
  })
  expect(stat).toHaveBeenCalledWith('/private/cache/library.dylib')
})
