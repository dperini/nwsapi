import { expect, test } from 'vitest'
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
    'bin/nwsapi.js',
    'src/nwsapi.js',
    'src/modules/nwsapi-legacy.js',
    'src/dom-selector.js',
    'src/modules/nwsapi-jquery.js',
    'src/modules/nwsapi-traversal.js',
    'dist/external/unicode.js',
    'dist/external/unicode.d.ts',
  ])
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
