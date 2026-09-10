import type { AnyNode } from 'acorn'
import type { Category, Signals } from './native-signals.mts'
import {
  callable,
  callName,
  cssValues,
  localBindings,
  rendering,
  selectors,
  testFunctions,
} from './native-signals.mts'
import { staticName } from './scope.mts'
import { walkAst } from './source.mts'

export function analyzeCallback(
  root: AnyNode,
  definitions: Map<string, AnyNode>,
  seen = new Set<string>(),
  followCalls = true,
  aliases = new Set<string>(),
  inherited = new Map<string, AnyNode>(),
): Signals {
  const isSelector = (node: AnyNode): boolean => {
    if (node.type !== 'CallExpression') {
      return false
    }
    const name = callName(node) || ''
    if (selectors.has(name) || aliases.has(name)) {
      return true
    }
    return (
      ['call', 'apply'].includes(name) &&
      node.callee.type === 'MemberExpression' &&
      node.callee.object.type === 'MemberExpression' &&
      selectors.has(staticName(node.callee.object.property) || '')
    )
  }
  const result: Signals = {
    selector: false,
    selectorMessage: false,
    parsing: false,
    rendering: false,
    css: false,
    asserts: 0,
    calls: [],
  }
  const bindings = localBindings(root, new Map(inherited))
  // Follow local values into assertions. Reading text/style from a selected fixture is not a selector assertion.
  // oxlint-disable-next-line eslint/complexity -- Follow the supported AST value shapes without evaluating test code.
  const selectorValue = (
    node: AnyNode,
    visited = new Set<string>(),
    scope = bindings,
  ): boolean => {
    if (
      node.type === 'Identifier' &&
      !visited.has(node.name) &&
      scope.has(node.name)
    ) {
      return selectorValue(
        scope.get(node.name)!,
        new Set([...visited, node.name]),
        scope,
      )
    }
    if (isSelector(node)) {
      return true
    }
    if (
      node.type === 'MemberExpression' &&
      (node.computed ||
        ['id', 'length'].includes(staticName(node.property) || ''))
    ) {
      return selectorValue(node.object, visited, scope)
    }
    if (node.type === 'BinaryExpression' || node.type === 'LogicalExpression') {
      return (
        selectorValue(node.left, visited, scope) ||
        selectorValue(node.right, visited, scope)
      )
    }
    if (node.type === 'ConditionalExpression') {
      return (
        selectorValue(node.test, visited, scope) ||
        selectorValue(node.consequent, visited, scope) ||
        selectorValue(node.alternate, visited, scope)
      )
    }
    if (node.type === 'ArrayExpression') {
      return node.elements.some(
        item => item && selectorValue(item, visited, scope),
      )
    }
    if (
      node.type === 'SpreadElement' ||
      node.type === 'UnaryExpression' ||
      node.type === 'ChainExpression'
    ) {
      return selectorValue(
        node.type === 'ChainExpression' ? node.expression : node.argument,
        visited,
        scope,
      )
    }
    if (node.type === 'CallExpression') {
      const name = callName(node) || ''
      if (
        node.callee.type === 'MemberExpression' &&
        [
          'map',
          'filter',
          'slice',
          'sort',
          'join',
          'includes',
          'every',
          'some',
          'at',
          'endsWith',
          'startsWith',
        ].includes(name)
      ) {
        return selectorValue(node.callee.object, visited, scope)
      }
      if (
        node.callee.type === 'MemberExpression' &&
        node.callee.object.type === 'Identifier' &&
        node.callee.object.name === 'Array' &&
        name === 'from' &&
        node.arguments[0]
      ) {
        return selectorValue(node.arguments[0], visited, scope)
      }
      const fn = definitions.get(name)
      if (
        fn &&
        !visited.has(name) &&
        (fn.type === 'FunctionDeclaration' ||
          fn.type === 'FunctionExpression' ||
          fn.type === 'ArrowFunctionExpression')
      ) {
        const childScope = new Map(scope)
        fn.params.forEach((param, i) => {
          if (param.type === 'Identifier' && node.arguments[i]) {
            childScope.set(param.name, node.arguments[i]!)
          }
        })
        localBindings(fn, childScope)
        const returns: AnyNode[] = []
        walkAst(fn, child => {
          if (child.type === 'ReturnStatement' && child.argument) {
            returns.push(child.argument)
          }
        })
        return returns.some(value =>
          selectorValue(value, new Set([...visited, name]), childScope),
        )
      }
    }
    if (callable(node)) {
      let found = false
      walkAst(node, item => {
        if (isSelector(item)) {
          found = true
        }
      })
      return found
    }
    return false
  }
  // oxlint-disable-next-line eslint/complexity -- Collect API and assertion signals in one AST traversal.
  walkAst(root, (node, ancestors) => {
    if (
      isSelector(node) &&
      (ancestors.at(-1)?.type === 'ExpressionStatement' ||
        (root.type === 'ArrowFunctionExpression' && root.body === node))
    ) {
      result.selector = true
      result.parsing = true
    }
    const name = callName(node)
    const property =
      node.type === 'MemberExpression' ? staticName(node.property) : undefined
    if (rendering.has(name || property || '')) {
      result.rendering = true
    }
    if (cssValues.has(name || property || '')) {
      result.css = true
    }
    if (!name) {
      return
    }
    result.calls.push(name)
    if (
      name === 'postMessage' &&
      node.type === 'CallExpression' &&
      node.arguments[0] &&
      selectorValue(node.arguments[0])
    ) {
      result.selector = true
      result.selectorMessage = true
    }
    if (name === 'unreached_func') {
      result.asserts++
    }
    if (
      name === 'generate_tests' &&
      node.type === 'CallExpression' &&
      node.arguments[0]?.type === 'Identifier' &&
      node.arguments[0].name.startsWith('assert_')
    ) {
      result.asserts++
    }
    if (
      name.startsWith('assert_') &&
      !definitions.has(name) &&
      node.type === 'CallExpression'
    ) {
      result.asserts++
      const reversed =
        node.arguments[0]?.type === 'Literal' ||
        (node.arguments[0]?.type === 'Identifier' &&
          !bindings.has(node.arguments[0].name))
      const actualArgs =
        name.startsWith('assert_throws') || reversed
          ? node.arguments
          : node.arguments.slice(0, 1)
      const actual = actualArgs
        .filter(arg => arg.type !== 'SpreadElement')
        .some(arg => selectorValue(arg))
      result.selector ||= actual
      result.parsing ||= actual && name.startsWith('assert_throws')
    }
    if (
      followCalls &&
      definitions.has(name) &&
      !seen.has(name) &&
      !testFunctions.has(name)
    ) {
      seen.add(name)
      const fn = definitions.get(name)!
      const parameters = new Map(bindings)
      if (
        node.type === 'CallExpression' &&
        (fn.type === 'FunctionDeclaration' ||
          fn.type === 'FunctionExpression' ||
          fn.type === 'ArrowFunctionExpression')
      ) {
        fn.params.forEach((param, i) => {
          const arg = node.arguments[i]
          if (param.type === 'Identifier' && arg) {
            parameters.set(
              param.name,
              arg.type === 'Identifier' ? bindings.get(arg.name) || arg : arg,
            )
          }
        })
      }
      const child = analyzeCallback(
        fn,
        definitions,
        seen,
        true,
        aliases,
        parameters,
      )
      result.selector ||= child.selector
      result.selectorMessage ||= child.selectorMessage
      result.parsing ||= child.parsing
      result.rendering ||= child.rendering
      result.css ||= child.css
      result.asserts += child.asserts
    }
  })
  return result
}

export function signalCategory(signals: Signals): Category {
  if (signals.selector) {
    return signals.rendering || signals.css
      ? 'mixed-selector'
      : signals.parsing
        ? 'selector-parsing'
        : 'selector-matching'
  }
  return signals.rendering
    ? 'rendering'
    : signals.css
      ? 'css-values'
      : 'other-api'
}
