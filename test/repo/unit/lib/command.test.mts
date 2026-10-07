import { expect, test, vi } from 'vitest'
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

test('interactive commands tolerate missing captured output and signaled status', async () => {
  const spawn = vi.fn(() => ({ status: null, stdout: null, stderr: null }))
  vi.doMock('node:child_process', () => ({ spawnSync: spawn }))
  vi.resetModules()
  try {
    const { execute: run, checked: check } =
      await import('../../../../scripts/repo/lib/command.mts')
    expect(
      run('example', [], {
        cwd: '/repo',
        interactive: true,
        env: { FIXTURE: 'yes' },
      }),
    ).toEqual({ status: 1, stdout: '', stderr: '' })
    expect(spawn).toHaveBeenCalledWith(
      'example',
      [],
      expect.objectContaining({ stdio: 'inherit', env: { FIXTURE: 'yes' } }),
    )
    expect(() => check('example', [], { cwd: '/repo' })).toThrow()
    expect(() =>
      check('example', [], { cwd: '/repo' }, () => ({
        status: 2,
        stdout: 'output',
        stderr: '',
      })),
    ).toThrow()
  } finally {
    vi.doUnmock('node:child_process')
    vi.resetModules()
  }
})
