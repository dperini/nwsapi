import type { AnyNode } from 'acorn'
import { parse } from 'acorn'
import { tokenize, tokenTypes } from 'css-tree'
import { JSDOM } from 'jsdom'
import { readFileSync } from 'node:fs'
import type { WptEntry } from '../../../../../test/repo/e2e/upstream/manifest.mts'
import {
  adaptAnPlusB,
  adaptSelectorInputs,
} from '../../../../../test/repo/e2e/upstream/parsing.mts'
import { REPO_ROOT } from '../../../lib/paths.mts'
import { namedTest, scriptPage, testName, walkAst, wptFile } from './ast.mts'

export function selectTests(
  source: string,
  selection: NonNullable<WptEntry['selectorTests']>,
) {
  const dom = new JSDOM(source)
  const found: string[] = []
  let total = 0
  try {
    for (const script of dom.window.document.scripts) {
      if (script.src || !script.textContent) {
        continue
      }
      const code = script.textContent
      const ast = parse(code, { ecmaVersion: 'latest' })
      const edits: SourceEdit[] = []
      for (const node of ast.body) {
        const call = namedTest(node)
        if (!call) {
          continue
        }
        total++
        const title = testName(call.arguments[1])
        if (
          title !== undefined &&
          title !== null &&
          selection.names.includes(title)
        ) {
          found.push(title)
        } else {
          edits.push({ start: node.start, end: node.end, text: '' })
        }
      }
      let result = code
      for (const edit of edits.toReversed()) {
        result = result.slice(0, edit.start) + result.slice(edit.end)
      }
      script.textContent = result
    }
    if (
      total !== selection.total ||
      JSON.stringify(found.toSorted()) !==
        JSON.stringify(selection.names.toSorted())
    ) {
      throw new Error(
        `Review upstream selector test selection: found ${total} tests and ${found.length} selected titles.`,
      )
    }
    return dom.serialize()
  } finally {
    dom.window.close()
  }
}

export function definedEdit(node: AnyNode): SourceEdit | undefined {
  if (node.type === 'FunctionDeclaration' && node.id?.name === 'test_defined') {
    const callback = node.body.body[0]
    if (
      callback?.type !== 'ExpressionStatement' ||
      callback.expression.type !== 'CallExpression'
    ) {
      throw new Error('Review defined-state helper.')
    }
    const fn = callback.expression.arguments[0]
    if (
      fn?.type !== 'ArrowFunctionExpression' ||
      fn.body.type !== 'BlockStatement' ||
      fn.body.body.length !== 6
    ) {
      throw new Error('Review defined-state assertions.')
    }
    return {
      start: fn.body.body[2]!.start,
      end: fn.body.body[5]!.end,
      text: '',
    }
  }
  return undefined
}

export function dynamicDirectionEdit(node: AnyNode): SourceEdit | undefined {
  if (
    node.type === 'VariableDeclaration' &&
    node.declarations.length === 1 &&
    node.declarations[0]?.id.type === 'Identifier' &&
    node.declarations[0].id.name === 'acs'
  ) {
    return { start: node.start, end: node.end, text: '' }
  }
  if (
    node.type === 'ExpressionStatement' &&
    node.expression.type === 'CallExpression' &&
    node.expression.callee.type === 'Identifier' &&
    node.expression.callee.name === 'assert_equals'
  ) {
    const actual = node.expression.arguments[0]
    if (
      actual?.type === 'MemberExpression' &&
      actual.object.type === 'Identifier' &&
      actual.object.name === 'acs'
    ) {
      return { start: node.start, end: node.end, text: '' }
    }
  }
  return undefined
}

export function inertEdit(node: AnyNode): SourceEdit | undefined {
  if (
    node.type === 'ExpressionStatement' &&
    node.expression.type === 'AssignmentExpression' &&
    node.expression.left.type === 'Identifier' &&
    node.expression.left.name === 'color'
  ) {
    return { start: node.start, end: node.end, text: '' }
  }
  return undefined
}

export interface SourceEdit {
  start: number
  end: number
  text: string
}

export function supportSelector(condition: string) {
  if (!condition.startsWith('selector(')) {
    throw new Error('Expected one selector() support condition.')
  }
  let depth = 0
  let end = condition.length
  tokenize(condition, (type, start, stop) => {
    if (type === tokenTypes.Function || type === tokenTypes.LeftParenthesis) {
      depth++
    } else if (type === tokenTypes.RightParenthesis && --depth === 0) {
      if (stop !== condition.length) {
        throw new Error('Review compound support conditions separately.')
      }
      end = start
    }
  })
  return condition.slice('selector('.length, end)
}

export function adaptSupports(source: string, expected: number) {
  const dom = new JSDOM(source)
  let count = 0
  try {
    for (const script of dom.window.document.scripts) {
      if (script.src || !script.textContent) {
        continue
      }
      const code = script.textContent
      const edits: SourceEdit[] = []
      walkAst(parse(code, { ecmaVersion: 'latest' }), node => {
        if (
          node.type !== 'CallExpression' ||
          node.callee.type !== 'MemberExpression' ||
          node.callee.object.type !== 'Identifier' ||
          node.callee.object.name !== 'CSS' ||
          node.callee.property.type !== 'Identifier' ||
          node.callee.property.name !== 'supports'
        ) {
          return
        }
        const input = node.arguments[0]
        if (
          node.arguments.length !== 1 ||
          input?.type !== 'Literal' ||
          typeof input.value !== 'string'
        ) {
          throw new Error('Review changed CSS.supports selector input.')
        }
        edits.push({
          start: node.start,
          end: node.end,
          text: `selectorSyntaxAccepted(${JSON.stringify(supportSelector(input.value))})`,
        })
      })
      let result = code
      for (const edit of edits.toSorted((a, b) => b.start - a.start)) {
        result =
          result.slice(0, edit.start) + edit.text + result.slice(edit.end)
      }
      count += edits.length
      script.textContent = result
    }
    if (count !== expected) {
      throw new Error(
        `Review CSS.supports adaptation: expected ${expected} inputs, found ${count}.`,
      )
    }
    const helper = dom.window.document.createElement('script')
    helper.src = '/css/support/parsing-testcommon.js'
    dom.window.document.head.prepend(helper)
    return dom.serialize()
  } finally {
    dom.window.close()
  }
}

export function formValidityEdit(node: AnyNode): SourceEdit | undefined {
  if (
    node.type === 'FunctionDeclaration' &&
    ['getBGColor', 'testStyles'].some(name => name === node.id?.name)
  ) {
    return { start: node.start, end: node.end, text: '' }
  }
  if (
    node.type !== 'ExpressionStatement' ||
    node.expression.type !== 'CallExpression' ||
    node.expression.callee.type !== 'Identifier' ||
    node.expression.callee.name !== 'test'
  ) {
    return undefined
  }
  const callback = node.expression.arguments[0]
  if (
    callback?.type === 'CallExpression' &&
    callback.callee.type === 'MemberExpression' &&
    callback.callee.object.type === 'Identifier' &&
    callback.callee.object.name === 'testStyles' &&
    callback.callee.property.type === 'Identifier' &&
    callback.callee.property.name === 'bind'
  ) {
    return { start: node.start, end: node.end, text: '' }
  }
  return undefined
}

export function directionEdit(
  node: AnyNode,
  ancestors: AnyNode[],
): SourceEdit | undefined {
  if (node.type !== 'Identifier' || node.name !== 'getComputedStyle') {
    return undefined
  }
  const statement = ancestors.findLast(
    parent => parent.type === 'ExpressionStatement',
  )
  if (
    statement?.type !== 'ExpressionStatement' ||
    statement.expression.type !== 'CallExpression' ||
    statement.expression.callee.type !== 'Identifier' ||
    statement.expression.callee.name !== 'assert_equals'
  ) {
    throw new Error('The upstream direction assertions changed.')
  }
  return { start: statement.start, end: statement.end, text: '' }
}

export function namespaceEdit(node: AnyNode): SourceEdit | undefined {
  if (
    node.type === 'ArrayExpression' &&
    node.elements.length === 2 &&
    node.elements[0]?.type === 'Literal' &&
    node.elements[0].value === 'matches' &&
    node.elements[1]?.type === 'Literal' &&
    node.elements[1].value === 'webkitMatchesSelector'
  ) {
    return { start: node.start, end: node.end, text: '["matches"]' }
  }
  if (
    node.type === 'MemberExpression' &&
    node.computed &&
    node.property.type === 'Identifier' &&
    node.property.name === 'method'
  ) {
    return {
      start: node.property.start,
      end: node.property.end,
      text: '"matches"',
    }
  }
  return undefined
}

export function webkitEdit(node: AnyNode): SourceEdit | undefined {
  if (
    node.type !== 'ExpressionStatement' ||
    node.expression.type !== 'CallExpression'
  ) {
    return undefined
  }
  const call = node.expression
  if (call.callee.type !== 'Identifier') {
    return undefined
  }
  const title = call.arguments[1]
  if (
    call.callee.name === 'test' &&
    title?.type === 'Literal' &&
    [
      'rules include webkit-prefixed pseudo-element should be cascaded',
      'webkit-prefixed pseudo-element selectors should be accessible from CSSOM',
    ].includes(String(title.value))
  ) {
    return { start: node.start, end: node.end, text: '' }
  }
  const actual = call.arguments[0]
  if (
    call.callee.name === 'assert_equals' &&
    actual?.type === 'MemberExpression' &&
    actual.object.type === 'MemberExpression' &&
    actual.object.property.type === 'Identifier' &&
    actual.object.property.name === 'cssRules'
  ) {
    return { start: node.start, end: node.end, text: '' }
  }
  return undefined
}

export function nodeListEdit(node: AnyNode): SourceEdit | undefined {
  if (
    node.type === 'ExpressionStatement' &&
    node.expression.type === 'CallExpression' &&
    node.expression.callee.type === 'Identifier' &&
    node.expression.callee.name === 'test' &&
    node.expression.arguments[1]?.type === 'Literal' &&
    node.expression.arguments[1].value ===
      'live NodeLists are for-of iterable and update appropriately'
  ) {
    return { start: node.start, end: node.end, text: '' }
  }
  return undefined
}

export function adaptDomOnly(
  source: string,
  mode: NonNullable<WptEntry['domOnly']>,
) {
  const adapters = {
    inert: { edit: inertEdit, expected: 1 },
    defined: { edit: definedEdit, expected: 1 },
    'dynamic-direction': { edit: dynamicDirectionEdit, expected: 3 },
    'form-validity': { edit: formValidityEdit, expected: 4 },
    'input-direction': { edit: directionEdit, expected: 3 },
    'slot-assignment': { edit: directionEdit, expected: 4 },
    'webkit-pseudos': { edit: webkitEdit, expected: 3 },
    'selector-lists': { edit: nodeListEdit, expected: 1 },
    'namespace-matches': { edit: namespaceEdit, expected: 4 },
  }
  const adapter = adapters[mode]
  const dom = new JSDOM(source)
  let edits = 0
  try {
    for (const script of dom.window.document.scripts) {
      if (script.src || !script.textContent) {
        continue
      }
      const code = script.textContent
      const ast = parse(code, { ecmaVersion: 'latest' })
      const replacements: SourceEdit[] = []
      walkAst(ast, (node, ancestors) => {
        const edit = adapter.edit(node, ancestors)
        if (edit) {
          replacements.push(edit)
        }
      })
      let result = code
      for (const edit of replacements.toSorted((a, b) => b.start - a.start)) {
        result =
          result.slice(0, edit.start) + edit.text + result.slice(edit.end)
      }
      edits += replacements.length
      script.textContent = result
    }
    if (edits !== adapter.expected) {
      throw new Error(
        `Review the upstream ${mode} adapter: expected ${adapter.expected} edits, found ${edits}.`,
      )
    }
    return dom.serialize()
  } finally {
    dom.window.close()
  }
}

export function pageSource(entry: WptEntry, root = REPO_ROOT) {
  if (entry.script) {
    const script = entry.path.slice(0, -5) + '.js'
    const source = readFileSync(wptFile(script, root), 'utf8')
    const page = scriptPage(
      entry.path,
      source,
      entry.reflectSwitch,
      entry.scriptDependencies,
      entry.domOnly ? source : undefined,
    )
    return entry.domOnly ? adaptDomOnly(page, entry.domOnly) : page
  }
  const source = readFileSync(wptFile(entry.path, root), 'utf8')
  if (entry.supportsInputs) {
    return adaptSupports(source, entry.supportsInputs)
  }
  if (entry.selectorTests) {
    return selectTests(source, entry.selectorTests)
  }
  if (entry.selectorInputs) {
    return adaptSelectorInputs(source, entry.selectorInputs)
  }
  if (entry.path.endsWith('/parse-anplusb.html')) {
    return adaptAnPlusB(source)
  }
  if (entry.domOnly) {
    return adaptDomOnly(source, entry.domOnly)
  }
  return source
}

export function pageContentType(url: string) {
  return ['.xht', '.xhtml', '.xml'].some(extension => url.endsWith(extension))
    ? 'application/xhtml+xml'
    : 'text/html'
}
export { walkAst } from './ast.mts'

export { wptFile } from './ast.mts'

export { scriptPage } from './ast.mts'

export { namedTest } from './ast.mts'

export { testName } from './ast.mts'
