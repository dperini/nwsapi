import { execFileSync } from 'node:child_process'
import https from 'node:https'
import nock from 'nock'
import { expect, test } from 'vitest'
import {
  clearUnitNetworkMocks,
  disableUnitNetwork,
  unitNetworkEnvironment,
} from '../../../../scripts/repo/test/network.mts'

test('unmocked HTTP and fetch calls are blocked before opening a connection', async () => {
  await expect(fetch('https://unmocked.invalid/')).rejects.toMatchObject({
    cause: { code: 'ENETUNREACH' },
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
  clearUnitNetworkMocks()
  disableUnitNetwork()
  await expect(fetch('https://fixture.invalid/data')).rejects.toMatchObject({
    cause: { code: 'ENETUNREACH' },
  })
})

test('unconsumed mocks fail by code and are removed for the next test', () => {
  nock('https://fixture.invalid').get('/unused').reply(200)
  expect(clearUnitNetworkMocks).toThrow(
    expect.objectContaining({
      code: 'ERR_UNIT_HTTP_MOCK_PENDING',
    }),
  )
  expect(nock.pendingMocks()).toEqual([])
})

test('child Node processes inherit the network guard and existing options', () => {
  const env = unitNetworkEnvironment({ NODE_OPTIONS: '--no-warnings' })
  expect(unitNetworkEnvironment(env)).toEqual(env)
  expect(unitNetworkEnvironment({}).NODE_OPTIONS).toBeTruthy()
  const result = execFileSync(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      "try { await fetch('https://unmocked.invalid/') } catch (error) { console.log(error.cause.code) }",
    ],
    { cwd: new URL('../../../../', import.meta.url), env, encoding: 'utf8' },
  )
  expect(result.trim()).toBe('ENETUNREACH')
})
