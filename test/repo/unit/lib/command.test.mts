import { expect, test } from 'vitest'
import { checked, execute } from '../../../../scripts/repo/lib/command.mts'

test('commands run without shell interpolation and preserve status and stderr', () => {
  const result = execute(
    process.execPath,
    [
      '-e',
      'process.stdout.write(process.argv[1]); process.stderr.write("failure"); process.exitCode = 7',
      '$(literal)',
    ],
    { cwd: process.cwd() },
  )
  expect(result).toEqual({ status: 7, stdout: '$(literal)', stderr: 'failure' })
  expect(() =>
    checked('example', [], { cwd: process.cwd() }, () => result),
  ).toThrow('failure')
  expect(
    checked('example', [], { cwd: process.cwd() }, () => ({
      status: 0,
      stdout: ' value\n',
      stderr: '',
    })),
  ).toBe('value')
  expect(() =>
    execute('/missing-nwsapi-executable', [], { cwd: process.cwd() }),
  ).toThrow()
})
