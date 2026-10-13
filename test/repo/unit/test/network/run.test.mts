import { execFileSync } from 'node:child_process'
import https from 'node:https'
import nock from 'nock'
import { expect, test } from 'vitest'
import {
  clearTestNetworkMocks,
  disableTestNetwork,
  testNetworkEnvironment,
} from '../../../../../scripts/repo/test/network/run.mts'

const importRequest = fetch('https://unmocked.invalid/import').catch(
  error => error,
)

test('the network guard is active while unit modules are imported', async () => {
  expect(await importRequest).toMatchObject({ code: 'ENETUNREACH' })
})

test('unmocked HTTP and fetch calls are blocked before opening a connection', async () => {
  await expect(fetch('https://unmocked.invalid/')).rejects.toMatchObject({
    code: 'ENETUNREACH',
  })
  const request = new Promise((_resolve, reject) => {
    https.get('https://unmocked.invalid/').once('error', reject)
  })
  await expect(request).rejects.toMatchObject({ code: 'ENETUNREACH' })
})

test('HTTP fixtures satisfy native fetch without enabling real connections', async () => {
  const scope = nock('https://fixture.invalid')
    .get('/data')
    .reply(200, { value: 42 })
  expect(await (await fetch('https://fixture.invalid/data')).json()).toEqual({
    value: 42,
  })
  expect(scope.isDone()).toBe(true)
  clearTestNetworkMocks()
  disableTestNetwork()
  await expect(fetch('https://fixture.invalid/data')).rejects.toMatchObject({
    code: 'ENETUNREACH',
  })
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
      "try { await fetch('https://unmocked.invalid/') } catch (error) { console.log(error.code) }",
    ],
    { cwd: new URL('../../../../../', import.meta.url), env, encoding: 'utf8' },
  )
  expect(result.trim()).toBe('ENETUNREACH')
})
