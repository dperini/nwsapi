import { expect, test } from 'vitest'
import { collectPackumentFailures } from '../../../../scripts/repo/lib/taze-output.mts'
test('registry failure formats deduplicate and sort package identities', () => {
  expect(
    collectPackumentFailures(
      'Failed to fetch package "zeta"\nTimeout requesting "alpha"\n> zeta unknown error\n> beta fetch failed\n> gamma timeout\nupdated delta',
    ),
  ).toEqual(['alpha', 'beta', 'gamma', 'zeta'])
  expect(collectPackumentFailures('updated all packages')).toEqual([])
})
