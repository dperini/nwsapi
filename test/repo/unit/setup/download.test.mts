import { createHash } from 'node:crypto'
import {
  mkdtempSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, expect, test, vi } from 'vitest'
import nock from 'nock'
import {
  downloadArchive,
  parseIntegrity,
  cachedArchive,
  verifyIntegrity,
} from '../../../../scripts/repo/setup/download.mts'

const directories: string[] = []
function fixture() {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'nwsapi-tool-download-'))
  directories.push(directory)
  return directory
}
afterEach(() => {
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true })
  }
})
const bytes = Buffer.from('verified release payload')
const integrity =
  'sha512-' + createHash('sha512').update(bytes).digest('base64')
const url = 'https://github.com/example/tool/releases/download/v1.0.0/tool.tgz'

test('direct integrity and cache checks reject corrupt payloads', () => {
  const file = path.join(fixture(), 'payload')
  expect(cachedArchive(file, integrity)).toBeUndefined()
  expect(() => verifyIntegrity(bytes, integrity)).not.toThrow()
  expect(() => verifyIntegrity(Buffer.from('altered'), integrity)).toThrow(
    'integrity mismatch',
  )
  writeFileSync(file, bytes)
  expect(cachedArchive(file, integrity)).toEqual(bytes)
  writeFileSync(file, 'altered')
  expect(() => cachedArchive(file, integrity)).toThrow('integrity mismatch')
})

test('a verified download is cached and reused without another request', async () => {
  const cache = fixture()
  const request = vi.fn(async () => new Response(bytes))
  expect(await downloadArchive(url, integrity, cache, request)).toEqual(bytes)
  expect(await downloadArchive(url, integrity, cache, request)).toEqual(bytes)
  expect(request).toHaveBeenCalledOnce()
})

test('a corrupt download never enters the cache', async () => {
  const cache = fixture()
  const request = vi.fn(async () => new Response('tampered'))
  await expect(downloadArchive(url, integrity, cache, request)).rejects.toThrow(
    'integrity mismatch',
  )
  expect(readdirSync(cache)).toEqual([])
})

test('cached bytes are checked again and corruption cannot trigger a fallback', async () => {
  const cache = fixture()
  const request = vi.fn(async () => new Response(bytes))
  await downloadArchive(url, integrity, cache, request)
  writeFileSync(path.join(cache, readdirSync(cache)[0]!), 'tampered')
  await expect(downloadArchive(url, integrity, cache, request)).rejects.toThrow(
    'integrity mismatch',
  )
  expect(request).toHaveBeenCalledOnce()
})

test('symlinks cannot substitute an archive cache entry', async () => {
  const cache = fixture()
  const file = path.join(
    cache,
    createHash('sha256').update(integrity).digest('hex'),
  )
  const external = path.join(fixture(), 'payload')
  writeFileSync(external, bytes)
  symlinkSync(external, file)
  await expect(downloadArchive(url, integrity, cache)).rejects.toThrow(
    'not a regular file',
  )
})

test('malformed integrity and failed HTTP requests fail before caching', async () => {
  const cache = fixture()
  const request = vi.fn(async () => new Response('', { status: 404 }))
  for (const value of ['', 'sha1-abc', 'sha256-YWJj', 'sha512-%%%']) {
    expect(() => parseIntegrity(value)).toThrow()
    await expect(downloadArchive(url, value, cache, request)).rejects.toThrow()
  }
  expect(request).not.toHaveBeenCalled()
  await expect(downloadArchive(url, integrity, cache, request)).rejects.toThrow(
    'HTTP 404',
  )
  expect(readdirSync(cache)).toEqual([])
})

test('SHA256 verification rejects noncanonical base64 and insecure source URLs', async () => {
  const pin = 'sha256-' + createHash('sha256').update(bytes).digest('base64')
  expect(() => verifyIntegrity(bytes, pin)).not.toThrow()
  expect(() =>
    parseIntegrity(
      'sha256-' + Buffer.alloc(32).toString('base64').slice(0, -1),
    ),
  ).toThrow()
  await expect(
    downloadArchive('http://example.test/archive', pin, fixture()),
  ).rejects.toThrow()
})
test('native download verifies bytes using the mocked HTTPS service', async () => {
  const service = nock('https://github.com')
    .get('/example/tool/releases/download/v1.0.0/tool.tgz')
    .reply(200, bytes)
  expect(await downloadArchive(url, integrity, fixture())).toEqual(bytes)
  expect(service.isDone()).toBe(true)
})
test('redirects to HTTP are rejected before cache promotion', async () => {
  const source = nock('https://github.com')
    .get('/example/tool/releases/download/v1.0.0/tool.tgz')
    .reply(302, '', { Location: 'http://redirect.example/tool.tgz' })
  const destination = nock('http://redirect.example')
    .get('/tool.tgz')
    .reply(200, bytes)
  const cache = fixture()
  // Explicit redirect handling avoids Node's native redirect cancellation under nock.
  const request: typeof fetch = async (input, options) => {
    const response = await fetch(input, { ...options, redirect: 'manual' })
    await response.arrayBuffer()
    const redirected = await fetch(response.headers.get('location')!, options)
    await redirected.arrayBuffer()
    return redirected
  }
  await expect(
    downloadArchive(url, integrity, cache, request),
  ).rejects.toThrow()
  expect(source.isDone() && destination.isDone()).toBe(true)
  expect(readdirSync(cache)).toEqual([])
})
