import { expect, test, vi } from 'vitest'
import { lintBinary } from '../../../../scripts/repo/lint/binary.mts'

test('uses tsrslint binaries on its supported platforms', () => {
  const resolve = vi.fn(() => '/checkout/node_modules/tsrslint')
  expect(lintBinary('linux', 'x64', vi.fn(), resolve)).toBe(
    '/checkout/node_modules/tsrslint',
  )
  expect(lintBinary('linux', 'arm64', vi.fn(), resolve)).toBe(
    '/checkout/node_modules/tsrslint',
  )
  expect(lintBinary('darwin', 'arm64', vi.fn(), resolve)).toBe(
    '/checkout/node_modules/tsrslint',
  )
  expect(resolve).toHaveBeenCalledTimes(3)
})

test('uses the platform binary fallback where tsrslint is not published', () => {
  const resolve = vi.fn((name: string) => `/checkout/node_modules/${name}`)
  expect(lintBinary('win32', 'x64', resolve)).toBe(
    '/checkout/node_modules/@maschwenk/oxlint-tsgolint-win32-x64/tsgolint.exe',
  )
  expect(lintBinary('win32', 'arm64', resolve)).toBe(
    '/checkout/node_modules/@maschwenk/oxlint-tsgolint-win32-arm64/tsgolint.exe',
  )
  expect(lintBinary('darwin', 'x64', resolve)).toBe(
    '/checkout/node_modules/@maschwenk/oxlint-tsgolint-darwin-x64/tsgolint',
  )
})
