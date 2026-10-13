import { expect, test } from 'vitest'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import { execFileSync } from 'node:child_process'
import {
  foldPathForCompare,
  isPathWithinRoot,
  normalizePath,
  toForwardSlashes,
  uvExecutablePath,
  moduleFileUrl,
} from '../../../../scripts/repo/lib/paths.mts'

test('filesystem module URLs preserve argument boundaries and import encoded filenames', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'nwsapi-module-url-'))
  const filename = '# model %.mjs'
  try {
    writeFileSync(path.join(root, filename), 'export const value = 42')
    const url = moduleFileUrl(root, filename)
    expect(url).toBe(pathToFileURL(path.join(root, filename)).href)
    expect(url).toContain('%23')
    expect(url).toContain('%25')
    // Vitest's resolver mishandles encoded filenames. Check Node's actual loader.
    const result = execFileSync(
      process.execPath,
      [
        '--input-type=module',
        '-e',
        'const model = await import(process.argv[1]); process.stdout.write(JSON.stringify(model.value))',
        url,
      ],
      { encoding: 'utf8' },
    )
    expect(JSON.parse(result)).toBe(42)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test.each([
  ['win32', 'uv.exe'],
  ['darwin', 'uv'],
  ['linux', 'uv'],
] as const)('selects the native uv shim on %s', (platform, filename) => {
  expect(uvExecutablePath('/checkout', platform)).toBe(
    path.join('/checkout', '.cache/bin', filename),
  )
})

test.each([
  ['C:\\Temp\\file', 'C:/Temp/file'],
  ['\\\\server\\share\\file', '//server/share/file'],
  ['a\\..//b/', 'a/..//b/'],
  ['./file', './file'],
  ['', ''],
])(
  'converts separators without changing path structure: %s',
  (input, expected) => {
    expect(toForwardSlashes(input)).toBe(expected)
  },
)

test.each([
  ['', '.'],
  ['foo\\bar//baz', 'foo/bar/baz'],
  ['foo/./bar/../baz', 'foo/baz'],
  ['../foo/../bar', '../bar'],
  ['C:\\Users\\user\\file.txt', 'C:/Users/user/file.txt'],
  ['C:\\', 'C:/'],
  ['C:', 'C:'],
  ['\\\\server\\share\\file', '//server/share/file'],
  ['\\\\?\\C:\\file', '//?/C:/file'],
  ['/tmp/a/../../file', '/file'],
])('normalizes %s to %s', (input, expected) => {
  expect(normalizePath(input)).toBe(expected)
})

test('accepts buffers and file URLs without an external package', () => {
  expect(normalizePath(Buffer.from('foo\\bar'))).toBe('foo/bar')
  const file = path.resolve('fixture with spaces')
  expect(normalizePath(pathToFileURL(file))).toBe(normalizePath(file))
})

test('converts MSYS drives only on Windows', () => {
  expect(normalizePath('/c/fixture')).toBe(
    process.platform === 'win32' ? 'C:/fixture' : '/c/fixture',
  )
})

test('folds paths for platform-aware comparisons', () => {
  expect(foldPathForCompare('folder\\child///')).toBe('folder/child')
  expect(foldPathForCompare('/')).toBe('/')
  expect(foldPathForCompare('C:\\Temp\\')).toBe(
    process.platform === 'win32' ? 'c:/temp' : 'C:/Temp',
  )
})

test('checks real paths against root boundaries', () => {
  expect(isPathWithinRoot('/repo', '/repo')).toBe(true)
  expect(isPathWithinRoot('/repo/sub/file', '/repo')).toBe(true)
  expect(isPathWithinRoot('/repo-other/file', '/repo')).toBe(false)
  expect(isPathWithinRoot('/repo', '/')).toBe(true)
})
