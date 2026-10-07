import nock from 'nock'
import { afterEach, beforeEach } from 'vitest'
import {
  clearUnitNetworkMocks,
  disableUnitNetwork,
  unitNetworkEnvironment,
} from '../../../scripts/repo/test/network.mts'

let unit = false
let originalOptions: string | undefined

beforeEach(context => {
  unit = context.task.file.filepath
    .replaceAll('\\', '/')
    .includes('/test/repo/unit/')
  if (unit) {
    disableUnitNetwork()
    originalOptions = process.env['NODE_OPTIONS']
    process.env['NODE_OPTIONS'] = unitNetworkEnvironment().NODE_OPTIONS
  } else {
    nock.enableNetConnect()
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
