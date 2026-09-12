import { expect, test } from 'vitest'
import { findSourceLayoutIssues } from '../../../../scripts/repo/lib/source-layout.mts'

test.each(['src/core', 'src/extension'])(
  'rejects loose runtime and declaration modules in %s',
  root => {
    expect(
      findSourceLayoutIssues([`${root}/loose.mts`, `${root}/types.d.ts`]),
    ).toEqual([
      {
        kind: 'uncategorized-module',
        file: `${root}/loose.mts`,
        directory: root,
      },
      {
        kind: 'uncategorized-module',
        file: `${root}/types.d.ts`,
        directory: root,
      },
    ])
  },
)

test('detects a file and directory pair from files without directory entries', () => {
  expect(
    findSourceLayoutIssues([
      'src/core/compile/pseudo.mts',
      'src/core/compile/pseudo/display.mts',
    ]),
  ).toEqual([
    {
      kind: 'module-directory-pair',
      file: 'src/core/compile/pseudo.mts',
      directory: 'src/core/compile/pseudo',
    },
  ])
})

test('detects a module beside an explicitly empty directory', () => {
  expect(
    findSourceLayoutIssues([
      'src/core/compile/pseudo.mts',
      'src/core/compile/pseudo',
    ]),
  ).toHaveLength(1)
})

test('accepts category modules, external loader pairs, and adapter entries', () => {
  expect(
    findSourceLayoutIssues([
      'src/core/initialize/nwsapi.mts',
      'src/core/compile/resolver.mts',
      'src/extension/legacy/register.mts',
      'src/extension/legacy/attributes.mts',
      'src/external/unicode.js',
      'src/external/unicode.d.ts',
      'src/adapter/jsdom.mts',
      'src/bin/nwsapi.mts',
      'src/core/.DS_Store',
    ]),
  ).toEqual([])
})

test('normalizes Windows paths and duplicate inventory entries', () => {
  expect(
    findSourceLayoutIssues([
      'src\\core\\compile\\pseudo.mts',
      'src/core/compile/pseudo.mts',
      'src/core/compile/pseudo/display.mts',
    ]),
  ).toEqual([
    {
      kind: 'module-directory-pair',
      file: 'src/core/compile/pseudo.mts',
      directory: 'src/core/compile/pseudo',
    },
  ])
})
