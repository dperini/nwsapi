import { expect, test } from 'vitest'
import {
  addSoakException,
  checkSoak,
  cleanSoakExceptions,
  soakPolicy,
  syncNpmSoak,
} from '../../../scripts/repo/soak.mts'
import { updateDependencies } from '../../../scripts/repo/update.mts'

const workspace =
  '# policy\nminimumReleaseAge: 1440\ncatalog:\n  example: 1.0.0\n'
const published = '2026-09-01T12:00:00.000Z'
const fresh = Date.parse('2026-09-01T13:00:00.000Z')

test('exact scoped bypasses expire at the publication timestamp plus the configured delay', () => {
  const added = addSoakException(
    workspace,
    '@scope/example@2.0.0',
    published,
    fresh,
  )
  expect(soakPolicy(added).excludes).toEqual(['@scope/example@2.0.0'])
  expect(added).toContain('removable: 2026-09-02T12:00:00.000Z')
  expect(
    addSoakException(added, '@scope/example@2.0.0', published, fresh),
  ).toBe(added)
  expect(cleanSoakExceptions(added, fresh)).toBe(added)
  const cleaned = cleanSoakExceptions(added, Date.parse('2026-09-02T12:00:00Z'))
  expect(soakPolicy(cleaned).excludes).toEqual([])
  expect(cleaned).toContain('# policy')
  expect(cleaned).toContain('example: 1.0.0')
})

test('bypasses reject broad patterns and unverifiable publication dates', () => {
  for (const spec of [
    'example',
    'example@latest',
    '@scope/*@1.0.0',
    'example@^1.0.0',
  ]) {
    expect(() => addSoakException(workspace, spec, published, fresh)).toThrow()
  }
  for (const date of ['invalid', '2027-01-01']) {
    expect(() =>
      addSoakException(workspace, 'example@1.0.0', date, fresh),
    ).toThrow()
  }
  expect(
    addSoakException(workspace, 'example@1.0.0', published, fresh + 86_400_000),
  ).toBe(workspace)
})

test('soak check rejects inconsistent managers and missing annotations', () => {
  checkSoak(workspace, 'min-release-age=1\n')
  expect(() => checkSoak(workspace, 'min-release-age=7\n')).toThrow()
  expect(() => checkSoak(workspace, '')).toThrow()
  expect(() =>
    cleanSoakExceptions(
      workspace + "minimumReleaseAgeExclude:\n  - 'example@1.0.0'\n",
    ),
  ).toThrow()
  for (const minutes of ['null', '-1', '1.1', 'Infinity', 'true']) {
    expect(() => soakPolicy(`minimumReleaseAge: ${minutes}`)).toThrow()
  }
})

test('npm synchronization preserves unrelated settings and removes expired bypasses', () => {
  const before =
    'save-exact=true\nmin-release-age=7\nmin-release-age-exclude[]=old@1.0.0\n'
  const after = syncNpmSoak(workspace, before)
  expect(after).toBe('save-exact=true\nmin-release-age=1\n')
  checkSoak(workspace, after)
})

test('policy preparation failures prevent both registry updates and installation', () => {
  const calls: string[] = []
  expect(() =>
    updateDependencies(
      false,
      () => {
        calls.push('taze')
      },
      () => {
        calls.push('install')
      },
      () => {
        throw new Error('policy')
      },
    ),
  ).toThrow()
  expect(calls).toEqual([])
})
