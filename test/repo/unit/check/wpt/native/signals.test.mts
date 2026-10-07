import { parse, type AnyNode } from 'acorn'
import { expect, test } from 'vitest'
import {
  callable,
  callName,
  checksMessageData,
  localBindings,
  matchesTitle,
  selectorAliases,
  titleParts,
} from '../../../../../../scripts/repo/check/wpt/native/signals.mts'
import { walkAst } from '../../../../../../scripts/repo/check/wpt/source/ast.mts'

const program = (source: string) =>
  parse(source, { ecmaVersion: 'latest', locations: true })

test('title matching preserves literal punctuation, unknown values and cached template matchers', () => {
  expect(titleParts(undefined)).toEqual([null])
  const ast = program('tag`\\unicode`; `case ${value}`; "a" + unknown + ".?[]"')
  const first = ast.body[0]
  if (
    first?.type !== 'ExpressionStatement' ||
    first.expression.type !== 'TaggedTemplateExpression'
  ) {
    throw new Error('Expected tagged template fixture.')
  }
  expect(titleParts(first.expression.quasi)).toEqual([''])
  const second = ast.body[1]
  if (second?.type !== 'ExpressionStatement') {
    throw new Error('Expected template fixture.')
  }
  const parts = titleParts(second.expression)
  expect(matchesTitle(parts, 'case div')).toBe(true)
  expect(matchesTitle(parts, 'case p')).toBe(true)
  expect(matchesTitle(['.?[]'], '.?[]')).toBe(true)
  expect(matchesTitle(['.?[]'], 'other')).toBe(false)
})

test('call signals recognize member calls but ignore callable expressions and noncall nodes', () => {
  const ast = program('node.matches("div"); (() => {})();')
  const names: Array<string | undefined> = []
  walkAst(ast, node => {
    if (node.type === 'CallExpression') {
      names.push(callName(node))
    }
  })
  expect(names).toEqual(['matches', undefined])
  expect(callName(ast)).toBeUndefined()
  expect(callable(undefined)).toBeUndefined()
  expect(callable(ast)).toBe(false)
})

test('selector aliases flow through function arguments and preserve only selector-only bindings', () => {
  const ast = program(
    'const method = node.matches; const unknown = node[0]; let empty; const alias = method; const mixed = "other"; const expression = function(arg) {}; const arrow = (arg) => {}; function declared(arg, missing, { key }) {} declared(method); expression("querySelector"); arrow("closest");',
  )
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
  const aliases = selectorAliases([{ ast }], definitions)
  expect(aliases.has('method')).toBe(true)
  expect(aliases.has('alias')).toBe(true)
  expect(aliases.has('arg')).toBe(true)
  expect(aliases.has('mixed')).toBe(false)
  expect(aliases.has('unknown')).toBe(false)
})

test('local bindings include loop variables and assignments while ignoring destructured values', () => {
  const ast = program(
    'let empty; const { value } = object; for (const method of ["matches"]) {} for (const { field } of list) {} method = "closest"; object.field = 1;',
  )
  const bindings = localBindings(ast, new Map())
  expect([...bindings.keys()]).toEqual(['method'])
  expect(bindings.get('method')?.type).toBe('Literal')
  expect(checksMessageData(program('assert_equals(event.data, true)'))).toBe(
    true,
  )
  expect(checksMessageData(program('const data = event.data; other()'))).toBe(
    false,
  )
})
