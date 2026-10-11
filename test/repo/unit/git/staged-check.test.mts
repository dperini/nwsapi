import { expect, test } from 'vitest'
import {
  parseStagedPaths,
  planStagedChecks,
} from '../../../../scripts/repo/git/staged-check.mts'

test('parses NUL-delimited Git paths without splitting spaces or newlines', () => {
  expect(
    parseStagedPaths(
      'docs/a file.md\0scripts/odd\nname.mts\0scripts/with\\slash.mts\0',
    ),
  ).toEqual([
    'docs/a file.md',
    'scripts/odd\nname.mts',
    'scripts/with\\slash.mts',
  ])
})

test('selects staged files from the existing lint and format scopes', () => {
  const plan = planStagedChecks(
    [
      'scripts/repo/example.mts',
      'assets/image.svg',
      '.config/repo/settings.json',
      'test/repo/unit/example.test.mts',
    ],
    ['scripts/repo/example.mts', 'test/repo/unit/example.test.mts'],
    [
      'scripts/repo/example.mts',
      '.config/repo/settings.json',
      'test/repo/unit/example.test.mts',
    ],
  )

  expect(plan).toEqual({
    lintFiles: ['scripts/repo/example.mts', 'test/repo/unit/example.test.mts'],
    formatFiles: [
      '.config/repo/settings.json',
      'scripts/repo/example.mts',
      'test/repo/unit/example.test.mts',
    ],
    fullLint: true,
    fullFormat: false,
  })
})

test('uses the whole lint scope for toolchain and configuration changes', () => {
  const plan = planStagedChecks(
    ['package.json', 'src/core/query.mts'],
    ['src/core/query.mts'],
    ['src/core/query.mts'],
  )

  expect(plan.fullLint).toBe(true)
  expect(plan.lintFiles).toEqual(['src/core/query.mts'])
})

test('uses the whole format scope when the formatter configuration changes', () => {
  const plan = planStagedChecks(
    ['.config/oxfmt.json'],
    [],
    ['.config/oxfmt.json'],
  )

  expect(plan.fullFormat).toBe(true)
  expect(plan.formatFiles).toEqual(['.config/oxfmt.json'])
})
