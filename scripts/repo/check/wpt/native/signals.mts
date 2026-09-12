import type { AnyNode } from 'acorn'
import { staticName } from '../scope.mts'
import { walkAst } from '../source/inspect.mts'

export type Category =
  | 'selector-parsing'
  | 'selector-matching'
  | 'mixed-selector'
  | 'rendering'
  | 'css-values'
  | 'other-api'
  | 'unresolved'

export interface Inference {
  category: Category
  reason: string
  file: string
  line: number
}

export interface Profile extends Inference {
  parts: Array<string | null>
  unnamed?: boolean
  messageAssertion?: boolean
}

export interface ScriptInput {
  file: string
  source: string
}

export const selectors = new Set([
  'querySelector',
  'querySelectorAll',
  'matches',
  'closest',
  'webkitMatchesSelector',
])

export const rendering = new Set([
  'getComputedStyle',
  'computedStyleMap',
  'getBoundingClientRect',
  'getClientRects',
  'elementFromPoint',
  'elementsFromPoint',
  'offsetWidth',
  'offsetHeight',
  'clientWidth',
  'clientHeight',
  'scrollWidth',
  'scrollHeight',
  'getImageData',
  'toDataURL',
  'checkLayout',
  'assert_styles',
  'assert_style',
])

export const cssValues = new Set([
  'getPropertyValue',
  'cssRules',
  'styleSheets',
  'selectorText',
  'CSSStyleSheet',
  'insertRule',
])

export const testFunctions = new Set(['test', 'promise_test', 'async_test'])

export function titleParts(node: AnyNode | undefined): Array<string | null> {
  if (!node) {
    return [null]
  }
  if (node.type === 'Literal' && typeof node.value === 'string') {
    return [node.value]
  }
  if (node.type === 'TemplateLiteral') {
    return node.quasis.flatMap((part, i) =>
      i < node.expressions.length
        ? [part.value.cooked || '', ...titleParts(node.expressions[i])]
        : [part.value.cooked || ''],
    )
  }
  if (node.type === 'BinaryExpression' && node.operator === '+') {
    return [...titleParts(node.left), ...titleParts(node.right)]
  }
  return [null]
}

const titleMatchers = new WeakMap<Array<string | null>, RegExp>()

export function matchesTitle(parts: Array<string | null>, title: string) {
  let matcher = titleMatchers.get(parts)
  if (!matcher) {
    // Patterns describe runtime test titles. JavaScript source is always parsed into an AST first.
    const escape = (text: string) =>
      text
        .split('')
        .map(char => ('^$\\.*+?()[]{}|'.includes(char) ? '\\' + char : char))
        .join('')
    matcher = new RegExp(
      '^' +
        parts
          .map(part => (part === null ? '[\\s\\S]*' : escape(part)))
          .join('') +
        '$',
    )
    titleMatchers.set(parts, matcher)
  }
  return matcher.test(title)
}

export function callable(node: AnyNode | undefined) {
  return (
    node &&
    [
      'FunctionDeclaration',
      'FunctionExpression',
      'ArrowFunctionExpression',
    ].includes(node.type)
  )
}

export function callName(node: AnyNode) {
  if (node.type !== 'CallExpression') {
    return undefined
  }
  if (node.callee.type === 'Identifier') {
    return node.callee.name
  }
  if (node.callee.type === 'MemberExpression') {
    return staticName(node.callee.property)
  }
  return undefined
}

export function selectorAliases(
  programs: Array<{ ast: AnyNode }>,
  definitions: Map<string, AnyNode>,
) {
  const values = new Map<string, Set<string>>()
  const add = (name: string, entries: string[]) => {
    const set = values.get(name) || new Set<string>()
    for (const value of entries) {
      set.add(value)
    }
    values.set(name, set)
  }
  const resolve = (node: AnyNode | undefined): string[] => {
    if (node?.type === 'Literal' && typeof node.value === 'string') {
      return [node.value]
    }
    if (node?.type === 'Identifier') {
      return [...(values.get(node.name) || [])]
    }
    if (
      node?.type === 'MemberExpression' &&
      selectors.has(staticName(node.property) || '')
    ) {
      return [staticName(node.property)!]
    }
    return []
  }
  let previous = -1
  for (let pass = 0; pass <= definitions.size; pass++) {
    const size = [...values.values()].reduce((sum, set) => sum + set.size, 0)
    if (size === previous) {
      break
    }
    previous = size
    for (const { ast } of programs) {
      walkAst(ast, node => {
        if (
          node.type === 'VariableDeclarator' &&
          node.id.type === 'Identifier'
        ) {
          add(node.id.name, resolve(node.init || undefined))
        }
        if (
          node.type === 'CallExpression' &&
          node.callee.type === 'Identifier'
        ) {
          const fn = definitions.get(node.callee.name)
          if (
            fn &&
            (fn.type === 'FunctionDeclaration' ||
              fn.type === 'FunctionExpression' ||
              fn.type === 'ArrowFunctionExpression')
          ) {
            fn.params.forEach((param, i) => {
              if (param.type === 'Identifier') {
                add(param.name, resolve(node.arguments[i]))
              }
            })
          }
        }
      })
    }
  }
  return new Set(
    [...values]
      .filter(
        ([, entries]) =>
          entries.size && [...entries].every(value => selectors.has(value)),
      )
      .map(([name]) => name),
  )
}

export interface Signals {
  selector: boolean
  selectorMessage: boolean
  parsing: boolean
  rendering: boolean
  css: boolean
  asserts: number
  calls: string[]
}

export function localBindings(root: AnyNode, bindings: Map<string, AnyNode>) {
  walkAst(root, node => {
    if (
      node.type === 'VariableDeclarator' &&
      node.id.type === 'Identifier' &&
      node.init
    ) {
      bindings.set(node.id.name, node.init)
    }
    if (
      node.type === 'ForOfStatement' &&
      node.left.type === 'VariableDeclaration' &&
      node.left.declarations[0]?.id.type === 'Identifier'
    ) {
      bindings.set(node.left.declarations[0].id.name, node.right)
    }
    if (
      node.type === 'AssignmentExpression' &&
      node.left.type === 'Identifier'
    ) {
      bindings.set(node.left.name, node.right)
    }
  })
  return bindings
}

export function checksMessageData(root: AnyNode) {
  let found = false
  walkAst(root, (node, ancestors) => {
    if (
      node.type === 'MemberExpression' &&
      staticName(node.property) === 'data' &&
      ancestors.some(parent => callName(parent)?.startsWith('assert_'))
    ) {
      found = true
    }
  })
  return found
}
