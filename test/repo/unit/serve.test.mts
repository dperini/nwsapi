import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import type { MockInstance } from 'vitest'
import type { IncomingMessage, ServerResponse } from 'node:http'
import path from 'node:path'
import { parse } from 'acorn'
import { REPO_ROOT } from '../../../scripts/repo/lib/paths.mts'

const state = vi.hoisted(() => ({
  exists: vi.fn(),
  real: vi.fn(),
  stat: vi.fn(),
  read: vi.fn(),
  stream: { on: vi.fn(), pipe: vi.fn() },
  handler: undefined as
    | ((req: IncomingMessage, res: ServerResponse) => void)
    | undefined,
  error: undefined as ((error: NodeJS.ErrnoException) => void) | undefined,
  listen: vi.fn(),
}))
let exit: MockInstance
vi.mock('node:fs', async importOriginal => ({
  ...(await importOriginal()),
  existsSync: state.exists,
  realpathSync: (file: string) => file,
  createReadStream: () => state.stream,
}))
vi.mock('node:fs/promises', async importOriginal => ({
  ...(await importOriginal()),
  realpath: state.real,
  stat: state.stat,
  readFile: state.read,
}))
vi.mock('node:http', async importOriginal => ({
  ...(await importOriginal()),
  createServer: (handler: typeof state.handler) => {
    state.handler = handler
    return {
      on: (_event: string, callback: typeof state.error) => {
        state.error = callback
      },
      listen: state.listen,
      address: () => ({ port: 8000 }),
    }
  },
}))

beforeEach(() => {
  vi.resetModules()
  vi.clearAllMocks()
  state.exists.mockReturnValue(true)
  state.real.mockImplementation(async (file: string) => file)
  state.stat.mockResolvedValue({ isDirectory: () => false, size: 12 })
  state.read.mockResolvedValue('const value: number = 1')
  state.handler = undefined
  state.error = undefined
  state.listen.mockImplementation((_port, _host, callback) => callback())
  vi.stubEnv('PORT', '')
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
  exit = vi.spyOn(process, 'exit').mockImplementation(() => {
    throw Object.assign(new Error('exit fixture'), { code: 'ERR_TEST_EXIT' })
  })
})
afterEach(() => vi.unstubAllEnvs())

async function request(url: string | undefined, method = 'GET') {
  const response = { writeHead: vi.fn(), end: vi.fn(), destroy: vi.fn() }
  state.handler!(
    { url, method } as IncomingMessage,
    response as unknown as ServerResponse,
  )
  await vi.waitFor(() => expect(response.writeHead).toHaveBeenCalled())
  return response
}

test('server binds only loopback and default port', async () => {
  await import('../../../scripts/repo/serve.mts')
  expect(state.listen).toHaveBeenCalledWith(
    8000,
    '127.0.0.1',
    expect.any(Function),
  )
})
test('explicit zero permits an ephemeral listener', async () => {
  vi.stubEnv('PORT', '0')
  await import('../../../scripts/repo/serve.mts')
  expect(state.listen.mock.calls[0]![0]).toBe(0)
})
test.each(['-1', '65536', '1.2', 'NaN'])(
  'invalid port %s fails without listening',
  async port => {
    vi.stubEnv('PORT', port)
    await expect(
      import('../../../scripts/repo/serve.mts'),
    ).rejects.toMatchObject({ code: 'ERR_TEST_EXIT' })
    expect(state.listen).not.toHaveBeenCalled()
  },
)
test('missing upstream checkout exits before listening', async () => {
  state.exists.mockReturnValue(false)
  await expect(import('../../../scripts/repo/serve.mts')).rejects.toMatchObject(
    { code: 'ERR_TEST_EXIT' },
  )
  expect(state.listen).not.toHaveBeenCalled()
})
test('unsupported methods and malformed URLs receive HTTP errors', async () => {
  await import('../../../scripts/repo/serve.mts')
  expect(
    (await request('/page.html', 'POST')).writeHead.mock.calls[0]![0],
  ).toBe(405)
  expect((await request('/%ZZ')).writeHead.mock.calls[0]![0]).toBe(400)
})
test('WPT and repository mounts stream files with content types', async () => {
  await import('../../../scripts/repo/serve.mts')
  const html = await request('/page.html')
  expect(state.real).toHaveBeenCalledWith(
    path.join(REPO_ROOT, 'upstream/wpt/page.html'),
  )
  expect(html.writeHead.mock.calls[0]![1]).toMatchObject({
    'content-type': 'text/html; charset=utf-8',
    'content-length': 12,
  })
  await request('/_repo/data.unknown')
  expect(state.real).toHaveBeenCalledWith(path.join(REPO_ROOT, 'data.unknown'))
  expect(state.stream.pipe).toHaveBeenCalledTimes(2)
})
test('HEAD sends headers without opening the stream', async () => {
  await import('../../../scripts/repo/serve.mts')
  const response = await request('/page.html', 'HEAD')
  expect(response.end).toHaveBeenCalledOnce()
  expect(state.stream.pipe).not.toHaveBeenCalled()
})
test('TypeScript fixtures are stripped and HEAD omits their body', async () => {
  await import('../../../scripts/repo/serve.mts')
  const body = (await request('/_repo/test/fixture.mts')).end.mock.calls[0]![0]
  expect(parse(body, { ecmaVersion: 'latest' })).toMatchObject({
    body: [
      {
        type: 'VariableDeclaration',
        declarations: [{ id: { name: 'value' }, init: { value: 1 } }],
      },
    ],
  })
  expect(
    (await request('/_repo/test/fixture.mts', 'HEAD')).end,
  ).toHaveBeenCalledWith('')
})
test('missing files and symlinks escaping either mount receive404', async () => {
  await import('../../../scripts/repo/serve.mts')
  state.real.mockRejectedValueOnce(new Error('missing'))
  expect((await request('/missing')).writeHead.mock.calls[0]![0]).toBe(404)
  state.real.mockResolvedValueOnce('/outside/secret')
  expect((await request('/link')).writeHead.mock.calls[0]![0]).toBe(404)
})
test('directories resolve index files and cannot escape via an index symlink', async () => {
  await import('../../../scripts/repo/serve.mts')
  state.stat.mockResolvedValueOnce({ isDirectory: () => true })
  await request('/_repo')
  expect(state.real).toHaveBeenCalledWith(path.join(REPO_ROOT, 'index.html'))
  state.stat.mockResolvedValueOnce({ isDirectory: () => true })
  state.real
    .mockResolvedValueOnce(path.join(REPO_ROOT, 'upstream/wpt/folder'))
    .mockResolvedValueOnce('/outside/index.html')
  expect((await request('/folder')).writeHead.mock.calls[0]![0]).toBe(404)
})
test('stream failures destroy the response', async () => {
  await import('../../../scripts/repo/serve.mts')
  const response = await request('/page.html')
  state.stream.on.mock.calls[0]![1]()
  expect(response.destroy).toHaveBeenCalledOnce()
})
test.each(['EADDRINUSE', 'EACCES'])(
  'listener failure %s exits unsuccessfully',
  async code => {
    await import('../../../scripts/repo/serve.mts')
    expect(() =>
      state.error!(Object.assign(new Error('fixture'), { code })),
    ).toThrow(expect.objectContaining({ code: 'ERR_TEST_EXIT' }))
    expect(exit).toHaveBeenCalledWith(1)
  },
)
