import { expect, test } from 'vitest'
import { parseUnitShardVerifyArgs } from '../../../../../scripts/repo/test/shard/verify.mts'

test('shard verification accepts its report directory', () => {
  expect(parseUnitShardVerifyArgs(['--directory', 'reports'])).toEqual({
    directory: 'reports',
    help: false,
  })
})

test('shard verification accepts help without a report directory', () => {
  expect(parseUnitShardVerifyArgs(['--help'])).toEqual({
    directory: undefined,
    help: true,
  })
})

test('shard verification requires a report directory and rejects unknown flags', () => {
  expect(() => parseUnitShardVerifyArgs([])).toThrow(
    '--directory must name the downloaded shard reports.',
  )
  expect(() => parseUnitShardVerifyArgs(['--unknown'])).toThrow()
})
