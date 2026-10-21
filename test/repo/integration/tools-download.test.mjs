import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
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
import {
  cachedArchive,
  downloadArchive,
} from '../../../scripts/lib/tools/download.mjs'

test('a corrupt cached tool archive is removed and downloaded again', async t => {
  const cache = mkdtempSync(path.join(os.tmpdir(), 'nwsapi-download-'))
  t.after(() => rmSync(cache, { recursive: true, force: true }))
  const bytes = Buffer.from('verified archive')
  const integrity = `sha256-${createHash('sha256').update(bytes).digest('base64')}`
  const identity = createHash('sha256').update(integrity).digest('hex')
  const file = path.join(cache, identity)
  writeFileSync(file, 'corrupt archive')
  let requests = 0

  const downloaded = await downloadArchive(
    'https://tools.example/archive.tgz',
    integrity,
    cache,
    async () => {
      requests++
      return {
        ok: true,
        url: 'https://tools.example/archive.tgz',
        arrayBuffer: async () => bytes,
      }
    },
  )

  assert.equal(requests, 1)
  assert.deepEqual(downloaded, bytes)
  assert.deepEqual(readFileSync(file), bytes)
})

test('a rejected replacement leaves no corrupt archive in the cache', async t => {
  const cache = mkdtempSync(path.join(os.tmpdir(), 'nwsapi-download-'))
  t.after(() => rmSync(cache, { recursive: true, force: true }))
  const bytes = Buffer.from('verified archive')
  const integrity = `sha256-${createHash('sha256').update(bytes).digest('base64')}`
  const identity = createHash('sha256').update(integrity).digest('hex')
  const file = path.join(cache, identity)
  writeFileSync(file, 'corrupt cache')

  await assert.rejects(
    downloadArchive(
      'https://tools.example/archive.tgz',
      integrity,
      cache,
      async () => ({
        ok: true,
        url: 'https://tools.example/archive.tgz',
        arrayBuffer: async () => Buffer.from('also corrupt'),
      }),
    ),
    { code: 'ERR_TOOL_INTEGRITY' },
  )

  assert.equal(existsSync(file), false)
})

test(
  'a symlink in the tool cache stays untouched',
  { skip: process.platform === 'win32' },
  async t => {
    const cache = mkdtempSync(path.join(os.tmpdir(), 'nwsapi-download-'))
    const outside = mkdtempSync(path.join(os.tmpdir(), 'nwsapi-download-outside-'))
    t.after(() => rmSync(cache, { recursive: true, force: true }))
    t.after(() => rmSync(outside, { recursive: true, force: true }))
    const bytes = Buffer.from('verified archive')
    const integrity = `sha256-${createHash('sha256').update(bytes).digest('base64')}`
    const identity = createHash('sha256').update(integrity).digest('hex')
    const file = path.join(cache, identity)
    const target = path.join(outside, 'archive')
    writeFileSync(target, 'preserve')
    symlinkSync(target, file)

    assert.throws(() => cachedArchive(file, integrity), /not a regular file/)
    await assert.rejects(
      downloadArchive('https://tools.example/archive.tgz', integrity, cache),
      /not a regular file/,
    )

    assert.equal(lstatSync(file).isSymbolicLink(), true)
    assert.equal(readFileSync(target, 'utf8'), 'preserve')
  },
)
