import nock from 'nock'
import { afterAll, afterEach, beforeEach, expect } from 'vitest'
import {
  clearUnitNetworkMocks,
  disableUnitNetwork,
  unitNetworkEnvironment,
} from '../../../scripts/repo/test/network.mts'

const unit =
  expect
    .getState()
    .testPath?.replaceAll('\\', '/')
    .includes('/test/repo/unit/') ?? process.env['NWSAPI_TEST_TIER'] === 'unit'
const fileOptions = process.env['NODE_OPTIONS']
let originalOptions: string | undefined

if (unit) {
  disableUnitNetwork()
  process.env['NODE_OPTIONS'] = unitNetworkEnvironment().NODE_OPTIONS
} else {
  nock.enableNetConnect()
}

beforeEach(() => {
  if (unit) {
    disableUnitNetwork()
    originalOptions = process.env['NODE_OPTIONS']
    process.env['NODE_OPTIONS'] = unitNetworkEnvironment().NODE_OPTIONS
  } else {
    nock.enableNetConnect()
  }
})

afterAll(() => {
  if (fileOptions === undefined) {
    delete process.env['NODE_OPTIONS']
  } else {
    process.env['NODE_OPTIONS'] = fileOptions
  }
})

afterEach(() => {
  if (unit) {
    if (originalOptions === undefined) {
      delete process.env['NODE_OPTIONS']
    } else {
      process.env['NODE_OPTIONS'] = originalOptions
    }
    clearUnitNetworkMocks()
  }
})
