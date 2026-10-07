import nock from 'nock'

const preload = new URL(
  '../../../.config/repo/vitest/network.mts',
  import.meta.url,
)

export function unitNetworkEnvironment(env: NodeJS.ProcessEnv = process.env) {
  const option = `--import=${preload.href}`
  const existing = env['NODE_OPTIONS'] ?? ''
  return {
    ...env,
    NODE_OPTIONS: existing.includes(option)
      ? existing
      : `${existing} ${option}`.trim(),
  }
}

export function disableUnitNetwork() {
  nock.disableNetConnect()
}

export function clearUnitNetworkMocks() {
  const pending = nock.pendingMocks()
  nock.abortPendingRequests()
  nock.cleanAll()
  nock.disableNetConnect()
  if (pending.length) {
    throw Object.assign(
      new Error('HTTP mock expectations were not consumed.'),
      {
        code: 'ERR_UNIT_HTTP_MOCK_PENDING',
        pending,
      },
    )
  }
}
