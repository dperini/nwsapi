import { expect, test } from 'vitest'
import { parseRunArgs } from '../../../../scripts/repo/run/options.mts'

test('runner options preserve the entry and forwarded arguments', () => {
  expect(
    parseRunArgs(['scripts/repo/test.mts', 'unit', '--reporter=verbose']),
  ).toEqual({
    args: ['unit', '--reporter=verbose'],
    entry: 'scripts/repo/test.mts',
    help: false,
    json: false,
    describe: false,
    dryRun: false,
  })
  expect(parseRunArgs(['scripts/repo/test.mts', '--help'])).toEqual({
    args: ['--help'],
    entry: 'scripts/repo/test.mts',
    help: false,
    json: false,
    describe: false,
    dryRun: false,
  })
})

test('runner controls do not change the script argument order', () => {
  expect(
    parseRunArgs([
      'scripts/repo/clean.mts',
      '--scope',
      'tools',
      '--dry-run',
      '--json',
    ]),
  ).toEqual({
    args: ['--scope', 'tools'],
    entry: 'scripts/repo/clean.mts',
    help: false,
    json: true,
    describe: false,
    dryRun: true,
  })
})

test('runner preserves control-looking values after the option terminator', () => {
  expect(parseRunArgs(['scripts/repo/example.mts', '--', '--json'])).toEqual({
    args: ['--', '--json'],
    entry: 'scripts/repo/example.mts',
    help: false,
    json: false,
    describe: false,
    dryRun: false,
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

test('runner rejects a dry-run request alongside description', () => {
  expect(() =>
    parseRunArgs(['scripts/repo/clean.mts', '--dry-run', '--describe']),
  ).toThrow('Choose --describe or --dry-run.')
})
