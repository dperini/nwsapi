import { expect, test, vi } from 'vitest'
import path from 'node:path'
import type { existsSync } from 'node:fs'
import {
  buildReadiness,
  buildRequiredFiles,
} from '../../../../scripts/repo/setup/build.mts'
import { currentOpenTuiTarget } from '../../../../scripts/repo/cli/ui/target.mts'

test('build readiness checks code and host assets with native paths', () => {
  const exists = vi.fn<typeof existsSync>(() => true)
  expect(buildReadiness('/checkout', exists)).toEqual({
    ready: true,
    issues: [],
  })
  expect(exists.mock.calls.map(call => call[0])).toEqual(
    buildRequiredFiles().map(file => path.join('/checkout', file.output)),
  )
})

test('missing outputs require repair', () => {
  const result = buildReadiness('/checkout', () => false)
  expect(result.ready).toBe(false)
  expect(result.issues).toHaveLength(buildRequiredFiles().length)
})

test('Linux assets use an explicit libc override or runtime detection', () => {
  expect(
    currentOpenTuiTarget('linux', 'x64', { OPENTUI_LIBC: 'musl' }),
  ).toEqual({
    platform: 'linux',
    arch: 'x64',
    libc: 'musl',
  })
  expect(
    currentOpenTuiTarget('linux', 'x64', {}, {
      getReport: () => ({ header: {} }),
    } as never),
  ).toEqual({
    platform: 'linux',
    arch: 'x64',
    libc: 'musl',
  })
  expect(
    currentOpenTuiTarget('linux', 'x64', {}, {
      getReport: () => ({ header: { glibcVersionRuntime: '2.36' } }),
    } as never),
  ).toEqual({ platform: 'linux', arch: 'x64', libc: 'glibc' })
})

test('unsupported platforms and architectures do not claim native readiness', () => {
  expect(() => currentOpenTuiTarget('aix', 'x64')).toThrow(
    'OpenTUI does not support aix',
  )
  expect(() => currentOpenTuiTarget('darwin', 'ia32')).toThrow(
    'OpenTUI does not support ia32',
  )
})

test('host asset readiness names only one native target', () => {
  const target = currentOpenTuiTarget('win32', 'arm64')
  const files = buildRequiredFiles(target).map(file => file.output)
  expect(files).toContain(
    'dist/bin/assets/@opentui/core-win32-arm64/opentui.dll',
  )
  expect(files).not.toContain(
    'dist/bin/assets/@opentui/core-darwin-arm64/libopentui.dylib',
  )
  expect(files).toContain('dist/bin/assets/@opentui/core/parser.worker.js')
})
