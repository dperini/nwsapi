import path from 'node:path'
import { REPO_ROOT } from '../../../../scripts/repo/lib/paths.mts'
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
    [path.join(REPO_ROOT, 'scripts/repo/setup/security.mts'), []],
    [UPSTREAM_HELPER_PATH, ['clone', 'upstream/wpt']],
    [UPSTREAM_HELPER_PATH, ['verify', 'upstream/wpt']],
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
  expect(calls).toHaveLength(4)
})
