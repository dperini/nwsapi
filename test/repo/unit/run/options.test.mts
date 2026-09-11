import { expect, test } from 'vitest'
import { parseRunArgs } from '../../../../scripts/repo/run/options.mts'

test('runner options preserve the entry and forwarded arguments', () => {
  expect(
    parseRunArgs(['scripts/repo/test.mts', 'unit', '--reporter=verbose']),
  ).toEqual({
    args: ['unit', '--reporter=verbose'],
    entry: 'scripts/repo/test.mts',
    help: false,
  })
  expect(parseRunArgs(['scripts/repo/test.mts', '--help'])).toEqual({
    args: ['--help'],
    entry: 'scripts/repo/test.mts',
    help: false,
  })
})

test.each([['--help'], ['-h']])('runner help accepts %s', flag => {
  expect(parseRunArgs([flag])).toEqual({ help: true })
})

test.each([
  { args: [] },
  { args: ['--help', 'extra'] },
  { args: ['--unknown'] },
])('runner options reject invalid input %#', ({ args }) => {
  expect(() => parseRunArgs(args)).toThrow()
})
