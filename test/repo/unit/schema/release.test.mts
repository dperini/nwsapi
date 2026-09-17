import { expect, test } from 'vitest'
import { validate as request } from '../../../../.config/generated/release-request.mts'
import { validate as receipt } from '../../../../.config/generated/release-receipt.mts'
import { RECEIPT } from '../../util/release-fixture.mts'

test('release schemas constrain requests and artifact receipts before runtime validation', () => {
  expect(request({ version: null, distTag: 'next' }).valid).toBe(true)
  expect(request({ version: '2.2.0', distTag: 'next' }).valid).toBe(false)
  expect(request({ version: '3.0.0-beta.1', distTag: 'next' }).valid).toBe(true)
  expect(request({ version: null, distTag: 'latest' }).valid).toBe(false)
  expect(receipt(RECEIPT).valid).toBe(true)
  for (const value of [
    { ...RECEIPT, commit: 'HEAD' },
    { ...RECEIPT, filename: '../release.tgz' },
    { ...RECEIPT, integrity: 'sha512-short' },
  ]) {
    expect(receipt(value).valid).toBe(false)
  }
})
