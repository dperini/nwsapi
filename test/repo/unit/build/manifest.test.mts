import { expect, test, vi } from 'vitest'
import { allPackageFiles } from '../../../../.config/build.config.mts'
import {
  assertPackageFiles,
  assertPackageManifest,
  checkPackageManifest,
  packageLayout,
  publishedManifest,
} from '../../../../scripts/repo/build/manifest.mts'

test('published exports preserve deep imports and point only to allowed files', () => {
  const layout = packageLayout('published')
  expect(layout.main).toBe('./src/nwsapi.js')
  expect(layout.bin).toEqual({ nwsapi: './bin/nwsapi.js' })
  expect(layout.exports['.']).toBe(layout.main)
  expect(layout.exports['./src/nwsapi']).toBe(layout.main)
  expect(layout.exports['./dist/external/unicode']).toEqual({
    types: './dist/external/unicode.d.ts',
    default: './dist/external/unicode.js',
  })
  for (const [key, value] of Object.entries(layout.exports)) {
    const targets = typeof value === 'string' ? [value] : Object.values(value)
    for (const target of targets) {
      expect(layout.files).toContain(target.slice(2))
    }
    expect(key).not.toContain('*')
  }
  expect(layout.files).toEqual([
    'LICENSE',
    'README.md',
    'package.json',
    ...allPackageFiles.map(file => file.published),
  ])
  expect(layout.files).toContain('bin/tui.mjs')
  expect(layout.files).toContain(
    'bin/assets/@opentui/core-linux-x64/libopentui.so',
  )
  expect(layout.exports).not.toHaveProperty(
    './bin/assets/@opentui/core-linux-x64/libopentui.so',
  )
})

test('CommonJS metadata and direct manifest verification are supported', async () => {
  expect(() =>
    assertPackageManifest({ ...packageLayout('output'), type: 'commonjs' }),
  ).not.toThrow()
  vi.doMock('../../../../scripts/repo/lib/run-node.mts', () => ({
    isMainModule: (url: string) => url.endsWith('/build/manifest.mts'),
  }))
  vi.resetModules()
  const log = vi.spyOn(console, 'log').mockImplementation(() => {})
  try {
    await import('../../../../scripts/repo/build/manifest.mts')
    expect(log).toHaveBeenCalledOnce()
  } finally {
    vi.doUnmock('../../../../scripts/repo/lib/run-node.mts')
    vi.resetModules()
  }
})

test('staging drops contributor scripts and dependencies without changing its input', () => {
  const manifest = checkPackageManifest()
  const original = structuredClone(manifest)
  const published = publishedManifest(manifest)
  expect(manifest).toEqual(original)
  expect(published['version']).toBe(manifest['version'])
  expect(published['peerDependencies']).toEqual(manifest['peerDependencies'])
  for (const key of [
    'scripts',
    'devDependencies',
    'devEngines',
    'allowScripts',
    'overrides',
  ]) {
    expect(published).not.toHaveProperty(key)
  }
  expect(published['exports']).toEqual(packageLayout('published').exports)
})

test.each([
  ['files', ['dist/**']],
  ['main', './src/nwsapi.js'],
  ['bin', { nwsapi: './scripts/repo/release/run.mts' }],
  ['exports', { '.': './dist/nwsapi.js', './*': './*' }],
  ['type', 'module'],
])('rejects incompatible %s metadata before staging', (key, value) => {
  const manifest = { ...packageLayout('output'), [key as string]: value }
  expect(() => assertPackageManifest(manifest)).toThrow()
  expect(() => publishedManifest(manifest)).toThrow()
})

test('requires an exact packed allowlist, including mandatory npm metadata', () => {
  const files = packageLayout('published').files
  expect(() => assertPackageFiles(files.toReversed())).not.toThrow()
  expect(() => assertPackageFiles([...files, '.env'])).toThrow(
    'Unexpected: .env',
  )
  expect(() => assertPackageFiles(files.slice(1))).toThrow('Missing: LICENSE')
  expect(() => assertPackageFiles([...files, files[0]!])).toThrow('Duplicate')
})
