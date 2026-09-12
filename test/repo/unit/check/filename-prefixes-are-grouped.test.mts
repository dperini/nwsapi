import { expect, test } from 'vitest'

import { checkFilenamePrefixGroups } from '../../../../scripts/repo/check/filename-prefixes-are-grouped.mts'

test('accepts grouped source modules', () => {
  expect(() =>
    checkFilenamePrefixGroups([
      'src/core/compile/class.mts',
      'src/core/compile/id.mts',
      'src/core/compile/token.mts',
    ]),
  ).not.toThrow()
})

test('rejects an ungrouped source module family', () => {
  expect(() =>
    checkFilenamePrefixGroups([
      'src/core/compile-class.mts',
      'src/core/compile-id.mts',
      'src/core/compile-token.mts',
    ]),
  ).toThrow()
})
