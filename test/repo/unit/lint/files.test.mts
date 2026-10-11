import assert from 'node:assert/strict'
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test } from 'vitest'

import {
  parseLintArguments,
  selectedLintFiles,
} from '../../../../scripts/repo/lint/files.mts'
import { REPO_ROOT } from '../../../../scripts/repo/lib/paths.mts'
import { toolingFiles } from '../../../../scripts/repo/lib/tooling-scope.mts'

test('no file selector retains the complete lint scope', () => {
  const parsed = parseLintArguments(['--threads=2'])
  assert.equal(parsed.files, undefined)
  assert.deepEqual(parsed.forwarded, ['--threads=2'])
  assert.deepEqual(selectedLintFiles(parsed.files), toolingFiles())
})

test('file selectors accept repeatable separated and equals forms', () => {
  assert.deepEqual(
    parseLintArguments([
      '--threads=2',
      '--file',
      'scripts/repo/lint.mts',
      '--file=--leading-name.mts',
      '--fix',
    ]),
    {
      files: ['scripts/repo/lint.mts', '--leading-name.mts'],
      forwarded: ['--threads=2', '--fix'],
    },
  )
})

test('selected files must be unique in-scope repository files', () => {
  assert.deepEqual(
    selectedLintFiles([
      'scripts/repo/lint.mts',
      path.join(REPO_ROOT, 'scripts/repo/lint.mts'),
    ]),
    ['scripts/repo/lint.mts'],
  )
  assert.throws(
    () => selectedLintFiles(['../package.json']),
    /outside the repository/,
  )
  assert.throws(
    () => selectedLintFiles(['README.md']),
    /outside the configured scope/,
  )
  assert.throws(
    () => selectedLintFiles(['scripts/repo/missing.mts']),
    /does not exist/,
  )
})

test('file selection handles a repository root reached through a symlink', () => {
  const temporary = mkdtempSync(
    path.join(os.tmpdir(), 'nwsapi-lint-path-test-'),
  )
  const actualRoot = path.join(temporary, 'actual')
  const linkedRoot = path.join(temporary, 'linked')
  try {
    mkdirSync(path.join(actualRoot, 'scripts/repo'), { recursive: true })
    writeFileSync(path.join(actualRoot, 'scripts/repo/example.mts'), '')
    symlinkSync(
      actualRoot,
      linkedRoot,
      process.platform === 'win32' ? 'junction' : 'dir',
    )

    assert.deepEqual(
      selectedLintFiles(['scripts/repo/example.mts'], linkedRoot, [
        'scripts/repo/example.mts',
      ]),
      ['scripts/repo/example.mts'],
    )
  } finally {
    rmSync(temporary, { recursive: true, force: true })
  }
})

test('file selectors reject empty, missing and NUL paths', () => {
  assert.throws(() => parseLintArguments(['--file']), /requires a path/)
  assert.throws(() => parseLintArguments(['--file=']), /nonempty path/)
  assert.throws(() => parseLintArguments(['--file=bad\0path']), /NUL/)
  assert.throws(() => selectedLintFiles(['bad\0path']), /NUL/)
})
