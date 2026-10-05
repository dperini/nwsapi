import { expect, test } from 'vitest'
import { discoverTasks } from '../../../scripts/repo/lib/task.mts'
import { checkCode } from '../../../scripts/repo/check.mts'
import { fixCode } from '../../../scripts/repo/fix.mts'
import {
  updateArgs,
  updateDependencies,
} from '../../../scripts/repo/dependency/update.mts'
import { collectPackumentFailures } from '../../../scripts/repo/lib/taze-output.mts'
import {
  SVG_CHECK_SCRIPT_PATH,
  FORMAT_SCRIPT_PATH,
  LINT_SCRIPT_PATH,
  TAZE_CLI_PATH,
} from '../../../scripts/repo/lib/paths.mts'

function recorder() {
  const calls: Array<[string, string[]]> = []
  return {
    calls,
    run: (entry: string, args: string[] = []) => {
      calls.push([entry, args])
    },
  }
}

test('registry lookup failures cannot appear as a successful update', () => {
  expect(
    collectPackumentFailures(
      'Failed to fetch package "z"\nTimeout requesting "a"\nFailed to fetch package "z"\nAlready up to date',
    ),
  ).toEqual(['a', 'z'])
  expect(
    collectPackumentFailures(
      ' ERROR \n\n> @types/node unknown error\nTypeError: fetch failed\n> taze unknown error\nTypeError: fetch failed',
    ),
  ).toEqual(['@types/node', 'taze'])
  expect(collectPackumentFailures('Already up to date')).toEqual([])
})

test('check runs formatting, lint, and types without fix flags', () => {
  const { calls, run } = recorder()
  checkCode(run)
  expect(calls).toEqual(
    discoverTasks('check').map(task => [task.entry, task.args]),
  )
})

test('fix formats after lint fixes and verifies the result', () => {
  const { calls, run } = recorder()
  fixCode((entry, args = []) => {
    run(entry, args)
    if (entry === LINT_SCRIPT_PATH && args.includes('--fix')) {
      throw new Error('remaining formatting')
    }
  })
  expect(calls[0]).toEqual([LINT_SCRIPT_PATH, ['--fix']])
  expect(calls[1]).toEqual([FORMAT_SCRIPT_PATH, []])
  expect(calls).toContainEqual([SVG_CHECK_SCRIPT_PATH, ['--fix']])
  const last = discoverTasks('check').at(-1)!
  expect(calls.at(-1)).toEqual([last.entry, last.args])
})

test('fix does not hide a failed final check', () => {
  expect(() =>
    fixCode(entry => {
      if (
        entry ===
        discoverTasks('check').find(task => task.name === 'lint:check')!.entry
      ) {
        throw new Error('unfixed lint error')
      }
    }),
  ).toThrow()
})

test('update includes catalog pins and derives the delay from workspace policy', () => {
  const args = updateArgs('minimumReleaseAge: 1440', false)
  expect(args).toContain('--include-locked')
  expect(args[args.indexOf('--maturity-period') + 1]).toBe('1')
  expect(args[args.indexOf('--exclude') + 1]).toContain('rolldown')
  expect(args).toContain('--write')
  expect(updateArgs('minimumReleaseAge: 1441', true)).toContain('2')
  expect(updateArgs('minimumReleaseAge: 1440', true)).not.toContain('--write')
  expect(() => updateArgs('minimumReleaseAge: -1', false)).toThrow()
  expect(() => updateArgs('{}', false)).toThrow()
})

test('update refreshes the lockfile only after a successful write pass', () => {
  const { calls, run } = recorder()
  let installs = 0
  const install = () => {
    installs++
  }
  updateDependencies(
    true,
    run,
    install,
    () => {},
    () => {},
  )
  expect(installs).toBe(0)
  updateDependencies(
    false,
    run,
    install,
    () => {},
    () => {},
  )
  expect(installs).toBe(1)
  expect(calls.every(([entry]) => entry === TAZE_CLI_PATH)).toBe(true)
  expect(() =>
    updateDependencies(
      false,
      () => {
        throw new Error('registry failed')
      },
      install,
      () => {},
      () => {},
    ),
  ).toThrow()
  expect(installs).toBe(1)
})
