import type { AnyNode } from 'acorn'
import { analyzeCallback, signalCategory } from './native-callback.mts'
import { parseNativeScript } from './native-metadata.mts'
import type { Inference, Profile, ScriptInput } from './native-signals.mts'
import {
  callable,
  callName,
  checksMessageData,
  matchesTitle,
  selectorAliases,
  testFunctions,
  titleParts,
} from './native-signals.mts'
import { staticName } from './scope.mts'
import { walkAst } from './source.mts'

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
export type { Category } from './native-signals.mts'

export type { Inference } from './native-signals.mts'

export type { Profile } from './native-signals.mts'

export type { ScriptInput } from './native-signals.mts'

export { titleParts } from './native-signals.mts'

export { matchesTitle } from './native-signals.mts'
