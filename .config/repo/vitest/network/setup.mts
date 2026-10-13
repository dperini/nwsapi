import { afterAll, afterEach, beforeEach } from 'vitest'
import {
  clearTestNetworkMocks,
  disableTestNetwork,
  testNetworkEnvironment,
} from '../../../../scripts/repo/test/network/run.mts'

const fileOptions = process.env['NODE_OPTIONS']

disableTestNetwork()
process.env['NODE_OPTIONS'] = testNetworkEnvironment().NODE_OPTIONS

beforeEach(() => {
  disableTestNetwork()
  process.env['NODE_OPTIONS'] = testNetworkEnvironment().NODE_OPTIONS
})

afterEach(() => {
  clearTestNetworkMocks()
})

afterAll(() => {
  if (fileOptions === undefined) {
    delete process.env['NODE_OPTIONS']
  } else {
    process.env['NODE_OPTIONS'] = fileOptions
  }
})
