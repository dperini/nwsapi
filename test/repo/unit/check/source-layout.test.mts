import { expect, test } from 'vitest'

import { checkSourceLayout } from '../../../../scripts/repo/check/source-layout.mts'

test('accepts grouped source modules', () => {
  expect(() =>
    checkSourceLayout([
      'src/core/compile/class.mts',
      'src/core/compile/id.mts',
      'src/core/compile/token.mts',
    ]),
  ).not.toThrow()
})

test('rejects an ungrouped source module family', () => {
  expect(() =>
    checkSourceLayout([
      'src/core/compile-class.mts',
      'src/core/compile-id.mts',
      'src/core/compile-token.mts',
    ]),
  ).toThrow()
})

test('rejects a loose module even without a shared filename prefix', () => {
  expect(() => checkSourceLayout(['src/core/factory.mts'])).toThrow()
})

test('rejects a module beside its category directory', () => {
  expect(() =>
    checkSourceLayout([
      'src/core/compile/pseudo.mts',
      'src/core/compile/pseudo/display.mts',
    ]),
  ).toThrow()
})
