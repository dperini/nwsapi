import { expect, test } from 'vitest'
import {
  nativeCarrierMatrix,
  nativeTarget,
} from '../../../../../scripts/repo/build/native/matrix.mts'

test('native carrier matrix maps package integrity and platform metadata for all targets', () => {
  expect(nativeCarrierMatrix).toHaveLength(8)
  expect(nativeCarrierMatrix.map(target => target.target)).toEqual([
    'darwin-arm64',
    'darwin-x64',
    'linux-arm64-gnu',
    'linux-arm64-musl',
    'linux-x64-gnu',
    'linux-x64-musl',
    'win32-arm64-msvc',
    'win32-x64-msvc',
  ])
  expect(
    nativeCarrierMatrix.every(target => target.integrity.startsWith('sha512-')),
  ).toBe(true)
  expect(nativeTarget('darwin-arm64')).toMatchObject({
    triple: 'aarch64-apple-darwin',
    platform: 'Darwin',
    arch: 'Arm64',
    libc: 'Na',
    library: 'libopentui.dylib',
    proof: 'host-proven',
  })
  expect(
    nativeCarrierMatrix.filter(target => target.proof === 'pending'),
  ).toHaveLength(7)
})

test('native target selection rejects missing or unsupported targets', () => {
  expect(() => nativeTarget(undefined)).toThrow(
    'Unsupported OpenTUI native target',
  )
  expect(() => nativeTarget('darwin-riscv64')).toThrow(
    'Unsupported OpenTUI native target',
  )
})
