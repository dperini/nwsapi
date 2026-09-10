import type { AnyNode } from 'acorn'
import { parseNativeScript } from './native-metadata.mts'
import { walkAst } from './source.mts'
import { staticName } from './scope.mts'

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
const selectors = new Set([
  'querySelector',
  'querySelectorAll',
  'matches',
  'closest',
  'webkitMatchesSelector',
])
const rendering = new Set([
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
const cssValues = new Set([
  'getPropertyValue',
  'cssRules',
  'styleSheets',
  'selectorText',
  'CSSStyleSheet',
  'insertRule',
])
const testFunctions = new Set(['test', 'promise_test', 'async_test'])

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
function callable(node: AnyNode | undefined) {
  return (
    node &&
    [
      'FunctionDeclaration',
      'FunctionExpression',
      'ArrowFunctionExpression',
    ].includes(node.type)
  )
}
function callName(node: AnyNode) {
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
function selectorAliases(
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

interface Signals {
  selector: boolean
  selectorMessage: boolean
  parsing: boolean
  rendering: boolean
  css: boolean
  asserts: number
  calls: string[]
}
function localBindings(root: AnyNode, bindings: Map<string, AnyNode>) {
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

function checksMessageData(root: AnyNode) {
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
function analyzeCallback(
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
function signalCategory(signals: Signals): Category {
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

export function inferScripts(inputs: ScriptInput[]) {
  const programs: Array<{ ast: AnyNode; file: string }> = []
  const errors: string[] = []
  const definitions = new Map<string, AnyNode>()
  for (const input of inputs) {
    try {
      const ast = parseNativeScript(input.source)
      programs.push({ ast, file: input.file })
      walkAst(ast, node => {
        if (node.type === 'FunctionDeclaration' && node.id) {
          definitions.set(node.id.name, node)
        }
        if (
          node.type === 'VariableDeclarator' &&
          node.id.type === 'Identifier' &&
          callable(node.init || undefined)
        ) {
          definitions.set(node.id.name, node.init!)
        }
      })
    } catch {
      errors.push(input.file)
    }
  }
  const aliases = selectorAliases(programs, definitions)
  const profiles: Profile[] = []
  for (const { ast, file } of programs) {
    // oxlint-disable-next-line eslint/complexity -- Registration forms share the same callback and helper analysis.
    walkAst(ast, (node, ancestors) => {
      if (
        node.type !== 'CallExpression' ||
        ![
          ...testFunctions,
          'step',
          'step_func',
          'step_func_done',
          'step_timeout',
        ].includes(callName(node) || '')
      ) {
        return
      }
      let cb: AnyNode | undefined = node.arguments[0]
      if (callName(node) === 'async_test' && (!cb || cb.type === 'Literal')) {
        const declaration = ancestors.at(-1)
        const receiver =
          declaration?.type === 'VariableDeclarator' &&
          declaration.id.type === 'Identifier'
            ? declaration.id.name
            : undefined
        const callbacks: AnyNode[] = []
        walkAst(ast, child => {
          if (
            child.type !== 'CallExpression' ||
            child.callee.type !== 'MemberExpression'
          ) {
            return
          }
          const object = child.callee.object
          if (
            object !== node &&
            !(
              receiver &&
              object.type === 'Identifier' &&
              object.name === receiver
            )
          ) {
            return
          }
          if (
            !['step', 'step_func', 'step_func_done', 'step_timeout'].includes(
              callName(child) || '',
            )
          ) {
            return
          }
          const callback =
            child.arguments[0]?.type === 'Identifier'
              ? definitions.get(child.arguments[0].name)
              : child.arguments[0]
          if (callback && callable(callback)) {
            callbacks.push(callback)
          }
        })
        // Only this test's deferred callbacks contribute. Neighboring tests may exercise unrelated selectors.
        const signals = callbacks.map(callback =>
          analyzeCallback(callback, definitions, new Set(), true, aliases),
        )
        profiles.push({
          parts: titleParts(cb),
          unnamed: !cb,
          category: signalCategory({
            selector: signals.some(signal => signal.selector),
            selectorMessage: signals.some(signal => signal.selectorMessage),
            parsing: signals.some(signal => signal.parsing),
            rendering: signals.some(signal => signal.rendering),
            css: signals.some(signal => signal.css),
            asserts: signals.reduce((sum, signal) => sum + signal.asserts, 0),
            calls: [],
          }),
          messageAssertion: callbacks.some(checksMessageData),
          file,
          line: node.loc!.start.line,
          reason:
            'Callback-free async_test registration. Classify its deferred assertions under the registered test name.',
        })
        return
      }
      if (cb?.type === 'Identifier') {
        cb = definitions.get(cb.name)
      }
      if (!cb || !callable(cb)) {
        return
      }
      const owner = ancestors.findLast(
        parent => parent.type === 'FunctionDeclaration',
      )
      const helper =
        owner?.type === 'FunctionDeclaration' ? owner.id?.name : undefined
      const standardParser =
        file.endsWith('/css/support/parsing-testcommon.js') &&
        ['test_valid_selector', 'test_invalid_selector'].includes(helper || '')
      const signals = analyzeCallback(cb, definitions, new Set(), true, aliases)
      const category = standardParser
        ? 'selector-parsing'
        : signalCategory(signals)
      profiles.push({
        messageAssertion: checksMessageData(cb),
        parts: titleParts(node.arguments[1]),
        unnamed:
          node.arguments[1] === undefined &&
          testFunctions.has(callName(node) || ''),
        category,
        file,
        line: node.loc!.start.line,
        reason: standardParser
          ? 'Upstream selector validity helper. Retain syntax assertions and exclude CSSOM serialization.'
          : category === 'other-api'
            ? 'Callback and resolved helpers assert another API. Selector calls only prepare fixtures or are absent.'
            : category === 'mixed-selector'
              ? 'Selector assertions share a callback with rendering or CSSOM assertions and need extraction.'
              : `AST callback and helper analysis: ${category}.`,
      })
    })
  }
  for (const program of programs) {
    let single = false
    walkAst(program.ast, node => {
      if (
        node.type === 'Property' &&
        staticName(node.key) === 'single_test' &&
        node.value.type === 'Literal' &&
        node.value.value === true
      ) {
        single = true
      }
    })
    if (single) {
      profiles.push({
        messageAssertion: checksMessageData(program.ast),
        parts: [null],
        category: signalCategory(
          analyzeCallback(program.ast, definitions, new Set(), true, aliases),
        ),
        file: program.file,
        line: 1,
        reason:
          'WPT single_test setup. Classify the top-level assertions as the page test.',
      })
    }
  }
  const allSignals = programs.map(program =>
    analyzeCallback(program.ast, definitions, new Set(), false, aliases),
  )
  const selectorMessages = allSignals.some(signals => signals.selectorMessage)
  if (selectorMessages) {
    for (const profile of profiles) {
      if (profile.category === 'other-api' && profile.messageAssertion) {
        profile.category = 'selector-matching'
        profile.reason =
          'Assertion checks a selector comparison forwarded by a statically resolved frame.'
      }
    }
  }
  const onlyOtherAssertions =
    allSignals.some(signals => signals.asserts) &&
    allSignals.every(signals => !signals.selector)
  const fallback: Inference | undefined = onlyOtherAssertions
    ? {
        category: 'other-api',
        reason:
          'All parsed assertions in the page and its helpers concern other APIs. Selector calls only acquire fixtures.',
        file: inputs[0]?.file || '',
        line: 0,
      }
    : undefined
  return { profiles, errors, fallback }
}

export function inferCase(
  title: string,
  profiles: Profile[],
): Inference | undefined {
  let matches = profiles.filter(profile => matchesTitle(profile.parts, title))
  const specific = matches.filter(profile =>
    profile.parts.some(part => part !== null && part.length > 0),
  )
  if (specific.length) {
    matches = specific
  }
  const specificity = (profile: Profile) =>
    profile.parts.reduce<number>(
      (length, part) => length + (part?.length || 0),
      0,
    )
  const best = Math.max(0, ...matches.map(specificity))
  if (best) {
    matches = matches.filter(profile => specificity(profile) === best)
  }
  const exact = matches.filter(profile =>
    profile.parts.every(part => part !== null),
  )
  if (exact.length) {
    matches = exact
  }
  const categories = new Set(matches.map(profile => profile.category))
  if (categories.size === 1) {
    return matches[0]
  }
  if (
    matches.length &&
    matches.every(profile => profile.category.startsWith('selector-'))
  ) {
    return {
      ...matches[0]!,
      category: 'selector-matching',
      reason:
        'Generated title maps to selector parsing or matching callbacks. Both are in scope.',
    }
  }
  if (
    matches.length &&
    matches.every(profile =>
      ['rendering', 'css-values', 'other-api'].includes(profile.category),
    )
  ) {
    return {
      ...matches[0]!,
      category: 'other-api',
      reason:
        'All matching generated callbacks test rendering, CSS values, or another API.',
    }
  }
  return undefined
}
