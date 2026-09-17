import { expect, test } from 'vitest'

import { checkNaming } from '../../../../scripts/repo/check/naming.mts'

test('accepts grouped source modules', () => {
  expect(() =>
    checkNaming([
      'src/core/compile/class.mts',
      'src/core/compile/id.mts',
      'src/core/compile/token.mts',
    ]),
  ).not.toThrow()
})

test('rejects an ungrouped source module family', () => {
  expect(() =>
    checkNaming([
      'src/core/compile-class.mts',
      'src/core/compile-id.mts',
      'src/core/compile-token.mts',
    ]),
  ).toThrow()
})

test('rejects a loose module even without a shared filename prefix', () => {
  expect(() => checkNaming(['src/core/factory.mts'])).toThrow()
})

test('rejects a module beside its category directory', () => {
  expect(() =>
    checkNaming([
      'src/core/compile/pseudo.mts',
      'src/core/compile/pseudo/display.mts',
    ]),
  ).toThrow()
})

test('rejects internal declaration files', () => {
  expect(() => checkNaming(['src/core/state/types.d.ts'])).toThrow()
})

test('rejects an ungrouped repository script family', () => {
  expect(() =>
    checkNaming([
      'scripts/repo/bench/query-browser.mts',
      'scripts/repo/bench/query-memory.mts',
      'scripts/repo/bench/query-timing.mts',
    ]),
  ).toThrow()
})
