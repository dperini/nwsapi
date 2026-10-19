import { execFileSync } from 'node:child_process'
import https from 'node:https'
import nock from 'nock'
import { expect, test, vi } from 'vitest'
import {
  clearTestNetworkMocks,
  testNetworkEnvironment,
} from '../../../../../scripts/repo/test/network/run.mts'

const importRequest = fetch('https://unmocked.invalid/import').catch(
  error => error,
)

test('the network guard is active while unit modules are imported', async () => {
  expect(await importRequest).toMatchObject({
    cause: { code: 'ERR_TEST_NETWORK_BLOCKED' },
  })
})

test('unmocked HTTP and fetch calls are blocked before opening a connection', async () => {
  await expect(fetch('https://unmocked.invalid/')).rejects.toMatchObject({
    cause: { code: 'ERR_TEST_NETWORK_BLOCKED' },
  })
  const request = new Promise((_resolve, reject) => {
    https.get('https://unmocked.invalid/').once('error', reject)
  })
  await expect(request).rejects.toMatchObject({
    code: 'ERR_TEST_NETWORK_BLOCKED',
  })
})

test('Vitest stubs fetch without opening a network connection', async () => {
  const request = vi.fn<typeof fetch>(
    async () => new Response(JSON.stringify({ value: 42 })),
  )
  vi.stubGlobal('fetch', request)
  try {
    expect(await (await fetch('https://fixture.invalid/data')).json()).toEqual({
      value: 42,
    })
    expect(request).toHaveBeenCalledWith('https://fixture.invalid/data')
  } finally {
    vi.unstubAllGlobals()
  }
})

test('unconsumed mocks fail by code and are removed for the next test', () => {
  nock('https://fixture.invalid').get('/unused').reply(200)
  expect(clearTestNetworkMocks).toThrow(
    expect.objectContaining({
      code: 'ERR_TEST_HTTP_MOCK_PENDING',
    }),
  )
  expect(nock.pendingMocks()).toEqual([])
})

test('child Node processes inherit the network guard and existing options', () => {
  const env = testNetworkEnvironment({ NODE_OPTIONS: '--no-warnings' })
  expect(testNetworkEnvironment(env)).toEqual(env)
  expect(testNetworkEnvironment({}).NODE_OPTIONS).toBeTruthy()
  const result = execFileSync(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      "try { await fetch('https://unmocked.invalid/') } catch (error) { console.log(error.cause?.code ?? error.code) }",
    ],
    { cwd: new URL('../../../../../', import.meta.url), env, encoding: 'utf8' },
  )
  expect(result.trim()).toBe('ERR_TEST_NETWORK_BLOCKED')
})
