import { expect, test } from 'vitest'
import { setupUpstream } from '../../../../scripts/repo/setup/run.mts'
import {
  BROWSER_SETUP_PATH,
  TOOL_SETUP_PATH,
  UPSTREAM_HELPER_PATH,
  WPT_CANDIDATES_PATH,
} from '../../../../scripts/repo/lib/paths.mts'

function recorder() {
  const calls: Array<[string, string[]]> = []
  return {
    calls,
    run: (entry: string, args: string[] = []) => {
      calls.push([entry, args])
    },
  }
}

test('setup verifies WPT and installs browser and Node runtimes', () => {
  const { calls, run } = recorder()
  setupUpstream(run)
  expect(calls).toEqual([
    [TOOL_SETUP_PATH, []],
    [UPSTREAM_HELPER_PATH, ['clone']],
    [UPSTREAM_HELPER_PATH, ['verify']],
    [WPT_CANDIDATES_PATH, []],
    [BROWSER_SETUP_PATH, []],
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
  expect(calls).toHaveLength(3)
})
