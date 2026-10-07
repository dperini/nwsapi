import { expect, test } from 'vitest'
import { checkLegacyHooks } from '../../../../scripts/repo/check/legacy-hooks.mts'

const legacy = `
function createLegacyHooks() {}
const createLegacyCache = function () {}
var legacyAttrOf = () => null
function helpReads() {}
`

test('accepts a separated legacy module with nested implementation bindings', () => {
  expect(() =>
    checkLegacyHooks('const core = { value: 1 }', legacy),
  ).not.toThrow()
})

test('rejects legacy implementations in the engine and duplicate engine bindings', () => {
  expect(() =>
    checkLegacyHooks('function outer() { const legacyIdOf = 1 }', legacy),
  ).toThrow()
  expect(() =>
    checkLegacyHooks('', legacy + '\nfunction Factory() {}'),
  ).toThrow()
  expect(() =>
    checkLegacyHooks('', 'function createLegacyHooks() {}'),
  ).toThrow()
})
