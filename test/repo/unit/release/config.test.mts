import { afterEach, expect, test } from 'vitest'
import { writeFileSync } from 'node:fs'
import path from 'node:path'
import {
  assertTrustedEnvironment,
  parseReceipt,
  readRequest,
  releaseTag,
  validateStageId,
  validateVersion,
} from '../../../../scripts/repo/release/config.mts'
import {
  RECEIPT,
  STAGE,
  TRUSTED_ENV,
  VERSION,
  releaseFixture,
} from '../../util/release-fixture.mts'

const cleanups: Array<() => void> = []
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) {
    cleanup()
  }
})

test('release identities reject maintenance versions and ambiguous tags', () => {
  expect(validateVersion(VERSION)).toBe(VERSION)
  expect(releaseTag('3.0.0')).toBe('v3.0.0')
  expect(validateStageId(STAGE)).toBe(STAGE)
  for (const version of [
    '2.2.27',
    '4.0.0',
    'v3.0.0',
    '3.0',
    '3.0.0+x',
    '3.0.0-01',
  ]) {
    expect(() => validateVersion(version)).toThrow()
  }
  expect(() => validateStageId('--registry=elsewhere')).toThrow()
})

test('release request and receipt validation reject unknown fields and identity drift', () => {
  const fixture = releaseFixture(null)
  cleanups.push(fixture.cleanup)
  expect(readRequest(fixture.root)).toEqual({ version: null, distTag: 'next' })
  writeFileSync(
    path.join(fixture.root, '.config/release-request.json'),
    JSON.stringify({ version: VERSION, distTag: 'latest' }),
  )
  expect(() => readRequest(fixture.root)).toThrow()
  expect(parseReceipt(RECEIPT)).toEqual(RECEIPT)
  for (const replacement of [
    { name: 'other' },
    { distTag: 'latest' },
    { filename: '../release.tgz' },
    { commit: 'short' },
    { extra: true },
  ]) {
    expect(() => parseReceipt({ ...RECEIPT, ...replacement })).toThrow()
  }
})

test('staging accepts only the exact workflow identity and refuses token fallback', () => {
  expect(() => assertTrustedEnvironment(TRUSTED_ENV)).not.toThrow()
  for (const key of Object.keys(TRUSTED_ENV)) {
    expect(() =>
      assertTrustedEnvironment({ ...TRUSTED_ENV, [key]: '' }),
    ).toThrow()
  }
  for (const key of ['NPM_TOKEN', 'NODE_AUTH_TOKEN', 'npm_config__authToken']) {
    expect(() =>
      assertTrustedEnvironment({ ...TRUSTED_ENV, [key]: 'fallback' }),
    ).toThrow()
  }
})
