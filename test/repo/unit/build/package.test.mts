import { expect, test } from 'vitest'
import { parseExpressionAt } from 'acorn'
import { runInNewContext } from 'node:vm'
import {
  moduleSpecifier,
  relocateImports,
} from '../../../../scripts/repo/build/package.mts'

test.each([
  ['require("./core.js")', './core.js'],
  ['import("./core.js")', './core.js'],
  ['require(variable)', undefined],
  ['require("a", "b")', undefined],
  ['loader("a")', undefined],
  ['"./core.js"', undefined],
])('recognizes literal module specifiers in %s', (source, expected) => {
  const node = parseExpressionAt(source, 0, { ecmaVersion: 'latest' })
  expect(moduleSpecifier(node)?.value).toBe(expected)
})

test('relocates runtime imports while preserving dependencies and ordinary strings', () => {
  const calls: string[] = []
  const result = runInNewContext(
    relocateImports(
      `require('../nwsapi.js');
       require('../external/unicode.js');
       require('css-tree');
       require('./unmapped.js');
       '../nwsapi.js'`,
      'dist/bin/nwsapi.js',
      'bin/nwsapi.js',
    ),
    { require: (specifier: string) => calls.push(specifier) },
  )
  expect(calls).toEqual([
    '../src/nwsapi.js',
    '../dist/external/unicode.js',
    'css-tree',
    './unmapped.js',
  ])
  expect(result).toBe('../nwsapi.js')
})

test('relocates dynamic imports using the same file mapping', () => {
  const result = relocateImports(
    'import("./adapter/dom-selector.js")',
    'dist/nwsapi.js',
    'src/nwsapi.js',
  )
  expect(
    moduleSpecifier(parseExpressionAt(result, 0, { ecmaVersion: 'latest' }))
      ?.value,
  ).toBe('./dom-selector.js')
})
