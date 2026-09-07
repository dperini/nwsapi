import { expect, test } from 'vitest'
import { checkCode } from '../../../scripts/repo/check.mts'
import { fixCode } from '../../../scripts/repo/fix.mts'
import { setupUpstream } from '../../../scripts/repo/setup.mts'
import {
  updateArgs,
  updateDependencies,
} from '../../../scripts/repo/update.mts'
import { toolVersions } from '../../../scripts/repo/external-tools.mts'
import { collectPackumentFailures } from '../../../scripts/repo/lib/taze-output.mts'
import {
  API_SCRIPT_PATH,
  SVG_CHECK_SCRIPT_PATH,
  FORMAT_SCRIPT_PATH,
  LINT_SCRIPT_PATH,
  PLAYWRIGHT_CLI_PATH,
  TAZE_CLI_PATH,
  TSC_CLI_PATH,
  TSC_CONFIG_PATH,
  UPSTREAM_HELPER_PATH,
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
  expect(collectPackumentFailures('Already up to date')).toEqual([])
})

test('setup clones and verifies WPT before installing Chromium', () => {
  const { calls, run } = recorder()
  setupUpstream(run)
  expect(calls).toEqual([
    [UPSTREAM_HELPER_PATH, ['clone']],
    [UPSTREAM_HELPER_PATH, ['verify']],
    [PLAYWRIGHT_CLI_PATH, ['install', 'chromium']],
  ])
})

test('setup stops if checkout verification fails', () => {
  const { calls, run } = recorder()
  expect(() =>
    setupUpstream((entry, args = []) => {
      run(entry, args)
      if (args.includes('verify')) {
        throw new Error('checkout failed')
      }
    }),
  ).toThrow()
  expect(calls).toHaveLength(2)
})

test('check runs formatting, lint, and types without fix flags', () => {
  const { calls, run } = recorder()
  checkCode(run)
  expect(calls).toEqual([
    [API_SCRIPT_PATH, ['--check']],
    [SVG_CHECK_SCRIPT_PATH, []],
    [FORMAT_SCRIPT_PATH, ['--check']],
    [LINT_SCRIPT_PATH, []],
    [TSC_CLI_PATH, ['--noEmit', '-p', TSC_CONFIG_PATH]],
  ])
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
  expect(calls.at(-1)).toEqual([
    TSC_CLI_PATH,
    ['--noEmit', '-p', TSC_CONFIG_PATH],
  ])
})

test('fix does not hide a failed final check', () => {
  expect(() =>
    fixCode((entry, args = []) => {
      if (entry === LINT_SCRIPT_PATH && !args.length) {
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
  updateDependencies(true, run, install)
  expect(installs).toBe(0)
  updateDependencies(false, run, install)
  expect(installs).toBe(1)
  expect(calls.every(([entry]) => entry === TAZE_CLI_PATH)).toBe(true)
  expect(() =>
    updateDependencies(
      false,
      () => {
        throw new Error('registry failed')
      },
      install,
    ),
  ).toThrow()
  expect(installs).toBe(1)
})

test('external tool versions reject shell or GitHub output injection', () => {
  const versions = toolVersions()
  expect(Object.getPrototypeOf(versions)).toBeNull()
  for (const version of ['26\nOTHER=value', '26; echo unsafe', 'latest']) {
    expect(() =>
      toolVersions({
        tools: {
          node: { origin: 'system', version },
          npm: { origin: 'system', version: '12.0.2' },
          pnpm: { origin: 'system', version: '12.3.4' },
        },
        $schema: '',
      }),
    ).toThrow()
  }
})
