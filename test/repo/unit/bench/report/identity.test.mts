import { expect, test } from 'vitest'
import { assertReportIdentity } from '../../../../../scripts/repo/bench/report/identity.mts'

const identity = {
  candidateVersion: '2.3.0',
  candidateSha256: 'core',
  competitorVersion: '9.1.1',
  lockfileSha256: 'lock',
  competitorBundleSha256: 'bundle',
  runtime: 'Chromium 154',
  cpu: 'fixture CPU',
  platform: 'fixture platform',
}

test.each([
  'runtime',
  'cpu',
  'platform',
  'candidateVersion',
  'candidateSha256',
  'competitorVersion',
  'lockfileSha256',
  'competitorBundleSha256',
] as const)('rejects a mixed benchmark %s', key => {
  expect(() =>
    assertReportIdentity(identity, [{ ...identity, [key]: 'different' }]),
  ).toThrow(/Benchmark/)
})

test('accepts matching builds and rejects missing identity fields', () => {
  const { competitorBundleSha256: _bundle, ...withoutBundle } = identity
  expect(() =>
    assertReportIdentity(identity, [{ ...identity }, withoutBundle]),
  ).not.toThrow()
  expect(() =>
    assertReportIdentity(identity, [{ ...identity, candidateSha256: '' }]),
  ).toThrow('missing')
})
