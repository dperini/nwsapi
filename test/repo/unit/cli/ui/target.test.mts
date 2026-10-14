import { expect, test } from 'vitest'
import { currentOpenTuiTarget } from '../../../../../scripts/repo/cli/ui/target.mts'

test('Linux target detection selects glibc, musl or an explicit override', () => {
  const report = (glibcVersionRuntime?: string) =>
    ({
      getReport: () => ({ header: { glibcVersionRuntime } }),
    }) as never
  expect(currentOpenTuiTarget('linux', 'x64', {}, report('2.39'))).toEqual({
    platform: 'linux',
    arch: 'x64',
    libc: 'glibc',
  })
  expect(currentOpenTuiTarget('linux', 'arm64', {}, report())).toEqual({
    platform: 'linux',
    arch: 'arm64',
    libc: 'musl',
  })
  expect(
    currentOpenTuiTarget(
      'linux',
      'x64',
      { OPENTUI_LIBC: 'musl' },
      report('2.39'),
    ),
  ).toEqual({ platform: 'linux', arch: 'x64', libc: 'musl' })
})
