import { isLoopbackHost } from './guard.mts'
import nock from 'nock'

const preload = new URL(
  '../../../../.config/repo/vitest/network/preload.mts',
  import.meta.url,
)

export function testNetworkEnvironment(env: NodeJS.ProcessEnv = process.env) {
  const option = `--import=${preload.href}`
  const existing = env['NODE_OPTIONS'] ?? ''
  return {
    ...env,
    NODE_OPTIONS: existing.includes(option)
      ? existing
      : `${existing} ${option}`.trim(),
  }
}

export function disableTestNetwork() {
  nock.disableNetConnect()
  nock.enableNetConnect(host => {
    const hostname = new URL(`http://${host}`).hostname
    return isLoopbackHost(hostname)
  })
}

export function clearTestNetworkMocks() {
  const pending = nock.pendingMocks()
  nock.abortPendingRequests()
  nock.cleanAll()
  disableTestNetwork()
  if (pending.length) {
    throw Object.assign(
      new Error('HTTP mock expectations were not consumed.'),
      {
        code: 'ERR_TEST_HTTP_MOCK_PENDING',
        pending,
      },
    )
  }
}
