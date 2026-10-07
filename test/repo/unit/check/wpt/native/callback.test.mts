import { parse, type AnyNode } from 'acorn'
import { expect, test } from 'vitest'
import {
  analyzeCallback,
  signalCategory,
} from '../../../../../../scripts/repo/check/wpt/native/callback.mts'
import { callable } from '../../../../../../scripts/repo/check/wpt/native/signals.mts'
import { walkAst } from '../../../../../../scripts/repo/check/wpt/source/ast.mts'

function callback(source: string, helpers = '', followCalls = true) {
  const ast = parse(helpers + '\nfunction main() {' + source + '}', {
    ecmaVersion: 'latest',
    locations: true,
  })
  const definitions = new Map<string, AnyNode>()
  walkAst(ast, node => {
    if (node.type === 'FunctionDeclaration' && node.id) {
      definitions.set(node.id.name, node)
    }
    if (
      node.type === 'VariableDeclarator' &&
      node.id.type === 'Identifier' &&
      node.init &&
      callable(node.init)
    ) {
      definitions.set(node.id.name, node.init)
    }
  })
  return analyzeCallback(
    definitions.get('main')!,
    definitions,
    new Set(),
    followCalls,
  )
}

test.each([
  'assert_true(false || node.matches("div"))',
  'assert_true(flag ? node.matches("div") : false)',
  'assert_true(flag ? false : node.matches("div"))',
  'assert_true(node.matches("div") ? true : false)',
  'assert_true([, node.matches("div")])',
  'assert_true([...document.querySelectorAll("div")])',
  'assert_true(!node.matches("div"))',
  'assert_true(document.querySelector("div")?.id)',
  'assert_true(document.querySelectorAll("div")[0])',
  'assert_true(Array.from(document.querySelectorAll("div")))',
  'assert_true(node.matches.apply(node, ["div"]))',
])('tracks selector values through supported assertion shapes: %s', source => {
  expect(callback(source).selector).toBe(true)
})

test.each([
  'assert_true(node[0].call(node))',
  'assert_true((() => true)())',
  'assert_true(node[0]())',
  'assert_true(node[`dynamic ${name}`])',
  'assert_true(...document.querySelectorAll("div"))',
  'assert_true(Array.from())',
])('does not infer a selector from unsupported call shapes: %s', source => {
  expect(callback(source).selector).toBe(false)
})

test('bare selector callbacks are syntax checks and generated assertion helpers count as assertions', () => {
  const ast = parse('() => node.matches("div")', {
    ecmaVersion: 'latest',
    locations: true,
  }).body[0]
  if (ast?.type !== 'ExpressionStatement') {
    throw new Error('Expected arrow callback fixture.')
  }
  expect(analyzeCallback(ast.expression, new Map())).toMatchObject({
    selector: true,
    parsing: true,
  })
  expect(
    callback(
      'unreached_func(); generate_tests(assert_equals, cases); generate_tests(other, cases)',
    ),
  ).toMatchObject({ asserts: 2 })
})

test('resolved helpers preserve parameter bindings and propagate selector, rendering and CSS signals', () => {
  const helpers =
    'const expression = function(node, missing, { value } = {}) { return node.matches("div") }; const arrow = node => node.matches("p"); function check(node, other) { assert_true(node.matches("div")); postMessage(node.matches("div")); getComputedStyle(node); sheet.cssRules; }'
  expect(
    callback(
      'assert_true(expression(node)); assert_true(arrow(node)); check(node)',
      helpers,
    ),
  ).toMatchObject({
    selector: true,
    selectorMessage: true,
    rendering: true,
    css: true,
  })
  expect(
    callback(
      'const fixture = document.querySelector("div"); check(fixture)',
      helpers,
    ),
  ).toMatchObject({ selector: true })
  expect(callback('check(node)', helpers, false)).toMatchObject({
    selector: false,
    selectorMessage: false,
    rendering: false,
    css: false,
  })
  const noArgs =
    'function value(missing) { return document.querySelector("div") }'
  expect(callback('assert_true(value())', noArgs).selector).toBe(true)
  expect(callback('assert_true(unknown())', '').selector).toBe(false)
})

test('helper definitions that are not callable cannot supply selector return values', () => {
  const root = parse('assert_true(unknown()); unknown()', {
    ecmaVersion: 'latest',
    locations: true,
  })
  const other = parse('1', { ecmaVersion: 'latest' }).body[0]!
  expect(analyzeCallback(root, new Map([['unknown', other]])).selector).toBe(
    false,
  )
})

test('signal categories distinguish matching, parsing, rendering and CSS-only callbacks', () => {
  expect(signalCategory(callback('assert_true(node.matches("div"))'))).toBe(
    'selector-matching',
  )
  expect(
    signalCategory(
      callback('assert_throws_dom("SyntaxError", () => node.matches(":bad"))'),
    ),
  ).toBe('selector-parsing')
  expect(
    signalCategory(
      callback('assert_true(node.matches("div")); getComputedStyle(node)'),
    ),
  ).toBe('mixed-selector')
  expect(signalCategory(callback('getComputedStyle(node)'))).toBe('rendering')
  expect(signalCategory(callback('sheet.cssRules'))).toBe('css-values')
  expect(signalCategory(callback('assert_true(true)'))).toBe('other-api')
})
