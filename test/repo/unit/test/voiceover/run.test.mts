import { PassThrough } from 'node:stream'
import { expect, test, vi } from 'vitest'
import { main } from '../../../../../scripts/repo/test/voiceover/run.mts'

const url =
  'http://127.0.0.1:5173/model-guide-reading.html?doc=docs/repo/selector/api.md'

test('status and help do not invoke a session runner', async () => {
  const run = fakeRunner()
  const write = vi.fn()
  expect(await main([], { run, write })).toBe(0)
  expect(await main(['--help'], { run, write })).toBe(0)
  expect(run).not.toHaveBeenCalled()
})

test('invalid target URL is rejected before confirmation or session runner', async () => {
  const confirm = vi.fn(async () => true)
  const run = fakeRunner()
  const error = vi.fn()
  const result = await main(
    ['--start-session', '--url', 'https://example.com/'],
    { confirm, run, error, tty: true },
  )
  expect(result).toBe(2)
  expect(confirm).not.toHaveBeenCalled()
  expect(run).not.toHaveBeenCalled()
})

test('noninteractive opt-in fails without starting the session', async () => {
  const run = fakeRunner()
  const error = vi.fn()
  const result = await main(['--start-session', '--url', url], {
    platform: 'darwin',
    run,
    error,
    tty: false,
  })
  expect(result).toBe(2)
  expect(run).not.toHaveBeenCalled()
  expect(error.mock.calls.join(' ')).toContain('No action was taken')
})

test('explicit confirmation runs only the fixed local page session', async () => {
  const run = fakeRunner()
  const confirm = vi.fn(async () => true)
  const result = await main(['--start-session', '--url', url], {
    confirm,
    platform: 'darwin',
    run,
    tty: true,
  })
  expect(result).toBe(0)
  expect(confirm).toHaveBeenCalledOnce()
  expect(run.mock.calls[0]?.[0]).toBe(url)
  expect(typeof run.mock.calls[0]?.[1]).toBe('function')
})

test('declining confirmation does not call the session runner', async () => {
  const run = fakeRunner()
  const result = await main(['--start-session', '--url', url], {
    confirm: async () => false,
    platform: 'darwin',
    run,
    tty: true,
    write: vi.fn(),
  })
  expect(result).toBe(0)
  expect(run).not.toHaveBeenCalled()
})

test('readline EOF is a skip', async () => {
  const input = new PassThrough() as unknown as NodeJS.ReadStream
  const output = new PassThrough() as unknown as NodeJS.WriteStream
  const run = fakeRunner()
  setImmediate(() => input.end())
  const result = await main(['--start-session', '--url', url], {
    run,
    platform: 'darwin',
    input,
    output,
    tty: true,
    write: vi.fn(),
  })
  expect(result).toBe(0)
  expect(run).not.toHaveBeenCalled()
})

test('an explicit request on another platform takes no action', async () => {
  const run = fakeRunner()
  const error = vi.fn()
  const result = await main(['--start-session', '--url', url], {
    platform: 'linux',
    tty: true,
    confirm: vi.fn(async () => true),
    run,
    error,
  })
  expect(result).toBe(1)
  expect(run).not.toHaveBeenCalled()
})

function fakeRunner() {
  return vi.fn(async (_url: string, _progress: (message: string) => void) => 0)
}
