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
  expect(request).toHaveBeenCalledWith(url, {
    headers: { Connection: 'close' },
    signal: expect.any(AbortSignal),
  })
})

test('a corrupt download never enters the cache', async () => {
  const cache = fixture()
  const request = vi.fn(async () => new Response('tampered'))
  await expect(downloadArchive(url, integrity, cache, request)).rejects.toThrow(
    'integrity mismatch',
  )
  expect(readdirSync(cache)).toEqual([])
})

test('network errors identify the safe download target and cause code', async () => {
  const cache = fixture()
  const requestUrl =
    'https://user:password@github.com/example/tool/releases/download/v1.0.0/tool.tgz?token=private'
  const cause = Object.assign(new Error('connection detail'), {
    code: 'ECONNRESET',
  })
  const request = vi.fn(async () => {
    throw Object.assign(new TypeError('fetch failed'), { cause })
  })
  let message = ''
  try {
    await downloadArchive(requestUrl, integrity, cache, request)
  } catch (error) {
    expect(error).toBeInstanceOf(Error)
    if (error instanceof Error) {
      message = error.message
    }
  }
  expect(message).toContain(
    'Tool download request failed for https://github.com/example/tool/releases/download/v1.0.0/tool.tgz: TypeError; cause Error (ECONNRESET).',
  )
  expect(message).not.toContain('password')
  expect(message).not.toContain('private')
  expect(message).not.toContain('connection detail')
  expect(request).toHaveBeenCalledTimes(3)
})

test('a transient header reset retries the same pinned URL and promotes verified bytes', async () => {
  const cache = fixture()
  const requestUrl = `${url}?token=private`
  const request = vi
    .fn<typeof fetch>()
    .mockRejectedValueOnce(
      Object.assign(new TypeError('fetch failed'), {
        cause: Object.assign(new Error('socket reset'), {
          code: 'ECONNRESET',
        }),
      }),
    )
    .mockResolvedValueOnce(new Response(bytes))
  const delay = vi.fn(
    async (_milliseconds: number, _signal: AbortSignal) => undefined,
  )
  const report = vi.fn()

  expect(
    await downloadArchive(requestUrl, integrity, cache, request, delay, report),
  ).toEqual(bytes)
  expect(
    await cachedArchive(path.join(cache, readdirSync(cache)[0]!), integrity),
  ).toEqual(bytes)
  expect(request).toHaveBeenCalledTimes(2)
  expect(request.mock.calls.map(([input]) => input)).toEqual([
    requestUrl,
    requestUrl,
  ])
  const firstSignal = request.mock.calls[0]![1]?.signal
  expect(request.mock.calls[1]![1]?.signal).toBe(firstSignal)
  expect(delay).toHaveBeenCalledWith(250, firstSignal)
  expect(report).toHaveBeenCalledWith(
    expect.stringContaining(
      'Retrying tool download (2/3) after ECONNRESET during headers',
    ),
  )
  expect(report.mock.calls.flat().join('\n')).not.toContain('private')
})

test('two transient resets recover on the last permitted attempt', async () => {
  const cache = fixture()
  const reset = Object.assign(new Error('socket reset'), {
    code: 'ECONNRESET',
  })
  const request = vi
    .fn<typeof fetch>()
    .mockRejectedValueOnce(reset)
    .mockRejectedValueOnce(reset)
    .mockResolvedValueOnce(new Response(bytes))
  const delay = vi.fn(
    async (_milliseconds: number, _signal: AbortSignal) => undefined,
  )

  expect(await downloadArchive(url, integrity, cache, request, delay)).toEqual(
    bytes,
  )
  expect(request).toHaveBeenCalledTimes(3)
  expect(delay.mock.calls.map(([milliseconds]) => milliseconds)).toEqual([
    250, 750,
  ])
})

test('transport resets exhaust at three attempts with bounded delays and no cache promotion', async () => {
  const cache = fixture()
  const request = vi.fn<typeof fetch>(async () => {
    throw Object.assign(new Error('socket reset'), { code: 'UND_ERR_SOCKET' })
  })
  const delay = vi.fn(
    async (_milliseconds: number, _signal: AbortSignal) => undefined,
  )
  const report = vi.fn()

  await expect(
    downloadArchive(url, integrity, cache, request, delay, report),
  ).rejects.toThrow('UND_ERR_SOCKET')

  expect(request).toHaveBeenCalledTimes(3)
  const signal = request.mock.calls[0]![1]?.signal
  expect(
    request.mock.calls.every(([, options]) => options?.signal === signal),
  ).toBe(true)
  expect(delay.mock.calls.map(([milliseconds]) => milliseconds)).toEqual([
    250, 750,
  ])
  expect(report).toHaveBeenCalledTimes(2)
  expect(readdirSync(cache)).toEqual([])
})

test('a body socket reset retries the original pinned archive', async () => {
  const cache = fixture()
  const interrupted = new Response(bytes)
  vi.spyOn(interrupted, 'arrayBuffer').mockRejectedValueOnce(
    Object.assign(new Error('body reset'), { code: 'UND_ERR_SOCKET' }),
  )
  const request = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(interrupted)
    .mockResolvedValueOnce(new Response(bytes))
  const delay = vi.fn(
    async (_milliseconds: number, _signal: AbortSignal) => undefined,
  )
  const report = vi.fn()

  expect(
    await downloadArchive(url, integrity, cache, request, delay, report),
  ).toEqual(bytes)
  expect(request).toHaveBeenCalledTimes(2)
  expect(delay).toHaveBeenCalledWith(250, request.mock.calls[0]![1]?.signal)
  expect(report).toHaveBeenCalledWith(
    expect.stringContaining('UND_ERR_SOCKET during body'),
  )
  expect(
    await cachedArchive(path.join(cache, readdirSync(cache)[0]!), integrity),
  ).toEqual(bytes)
})

test('TLS failures are never retried', async () => {
  const cache = fixture()
  const request = vi.fn<typeof fetch>(async () => {
    throw Object.assign(new Error('certificate rejected'), {
      code: 'CERT_HAS_EXPIRED',
    })
  })
  const delay = vi.fn(
    async (_milliseconds: number, _signal: AbortSignal) => undefined,
  )

  await expect(
    downloadArchive(url, integrity, cache, request, delay),
  ).rejects.toThrow('CERT_HAS_EXPIRED')
  expect(request).toHaveBeenCalledOnce()
  expect(delay).not.toHaveBeenCalled()
})

test('AbortError with a nested socket reset is never retried', async () => {
  const cache = fixture()
  const request = vi.fn<typeof fetch>(async () => {
    throw Object.assign(new Error('aborted request'), {
      name: 'AbortError',
      cause: Object.assign(new Error('socket reset'), {
        code: 'ECONNRESET',
      }),
    })
  })
  const delay = vi.fn(
    async (_milliseconds: number, _signal: AbortSignal) => undefined,
  )

  await expect(
    downloadArchive(url, integrity, cache, request, delay),
  ).rejects.toThrow('AbortError')
  expect(request).toHaveBeenCalledOnce()
  expect(delay).not.toHaveBeenCalled()
})

test('a deadline during retry backoff prevents another request', async () => {
  const cache = fixture()
  const controller = new AbortController()
  vi.spyOn(AbortSignal, 'timeout').mockReturnValue(controller.signal)
  const request = vi.fn<typeof fetch>(async () => {
    throw Object.assign(new Error('socket reset'), { code: 'ECONNRESET' })
  })
  const delay = vi.fn(async (milliseconds: number) => {
    if (milliseconds === 750) {
      controller.abort(new Error('deadline'))
    }
  })

  await expect(
    downloadArchive(url, integrity, cache, request, delay),
  ).rejects.toThrow('ECONNRESET')
  expect(request).toHaveBeenCalledTimes(2)
  expect(delay.mock.calls.map(([milliseconds]) => milliseconds)).toEqual([
    250, 750,
  ])
})

test('an aborted shared timeout prevents a reset retry', async () => {
  const cache = fixture()
  const controller = new AbortController()
  vi.spyOn(AbortSignal, 'timeout').mockReturnValue(controller.signal)
  const request = vi.fn<typeof fetch>(async () => {
    controller.abort(new Error('deadline'))
    throw Object.assign(new Error('socket reset'), { code: 'ECONNRESET' })
  })
  const delay = vi.fn(
    async (_milliseconds: number, _signal: AbortSignal) => undefined,
  )

  await expect(
    downloadArchive(url, integrity, cache, request, delay),
  ).rejects.toThrow('ECONNRESET')
  expect(request).toHaveBeenCalledOnce()
  expect(delay).not.toHaveBeenCalled()
})

test('corrupt cached bytes are replaced only by the same verified release', async () => {
  const cache = fixture()
  const request = vi.fn(async () => new Response(bytes))
  await downloadArchive(url, integrity, cache, request)
  writeFileSync(path.join(cache, readdirSync(cache)[0]!), 'tampered')
  expect(await downloadArchive(url, integrity, cache, request)).toEqual(bytes)
  expect(await downloadArchive(url, integrity, cache, request)).toEqual(bytes)
  expect(request).toHaveBeenCalledTimes(2)
})

test('a corrupt replacement is rejected and leaves a retryable cache', async () => {
  const cache = fixture()
  const request = vi.fn(async () => new Response(bytes))
  await downloadArchive(url, integrity, cache, request)
  writeFileSync(path.join(cache, readdirSync(cache)[0]!), 'tampered')
  request.mockImplementationOnce(async () => new Response('also tampered'))
  await expect(downloadArchive(url, integrity, cache, request)).rejects.toThrow(
    'integrity mismatch',
  )
  expect(readdirSync(cache)).toEqual([])
  expect(await downloadArchive(url, integrity, cache, request)).toEqual(bytes)
  expect(request).toHaveBeenCalledTimes(3)
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
  const service = nock('https://github.com', {
    reqheaders: { connection: 'close' },
  })
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
