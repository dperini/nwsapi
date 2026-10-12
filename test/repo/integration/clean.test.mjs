import assert from 'node:assert/strict'
import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { cleanRepository } from '../../../scripts/clean.mts'

test('clean removes checkout outputs and preserves the legacy lint placeholder', t => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'nwsapi-clean-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const sharedCache = path.join(os.tmpdir(), path.basename(root) + '-shared')
  mkdirSync(sharedCache)
  writeFileSync(path.join(sharedCache, 'browser'), 'shared')
  t.after(() => rmSync(sharedCache, { recursive: true, force: true }))

  for (const directory of [
    'node_modules',
    'coverage',
    '.nyc_output',
    '.cache',
    'test-results',
    'playwright-report',
  ]) {
    mkdirSync(path.join(root, directory))
    writeFileSync(path.join(root, directory, 'output'), 'temporary')
  }
  mkdirSync(path.join(root, 'dist', 'build'), { recursive: true })
  writeFileSync(path.join(root, 'dist', 'lint.log'), '')
  writeFileSync(path.join(root, 'dist', 'build', 'artifact.js'), 'temporary')

  cleanRepository(root)

  for (const directory of [
    'node_modules',
    'coverage',
    '.nyc_output',
    '.cache',
    'test-results',
    'playwright-report',
  ]) {
    assert.equal(existsSync(path.join(root, directory)), false)
  }
  assert.equal(readFileSync(path.join(root, 'dist', 'lint.log'), 'utf8'), '')
  assert.equal(existsSync(path.join(root, 'dist', 'build')), false)
  assert.equal(readFileSync(path.join(sharedCache, 'browser'), 'utf8'), 'shared')
})

test(
  'clean preserves files reached through a dist symlink',
  { skip: process.platform === 'win32' },
  t => {
    const root = mkdtempSync(path.join(os.tmpdir(), 'nwsapi-clean-link-'))
    const outside = mkdtempSync(path.join(os.tmpdir(), 'nwsapi-clean-outside-'))
    t.after(() => rmSync(root, { recursive: true, force: true }))
    t.after(() => rmSync(outside, { recursive: true, force: true }))
    const sentinel = path.join(outside, 'keep.txt')
    writeFileSync(sentinel, 'outside checkout')
    symlinkSync(outside, path.join(root, 'dist'))

    cleanRepository(root)

    assert.equal(lstatSync(path.join(root, 'dist')).isSymbolicLink(), true)
    assert.equal(readFileSync(sentinel, 'utf8'), 'outside checkout')
  },
)
