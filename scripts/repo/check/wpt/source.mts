import { readFileSync } from 'node:fs'
import path from 'node:path'
import { parse } from 'acorn'
import type { AnyNode } from 'acorn'
import { JSDOM } from 'jsdom'
import { REPO_ROOT } from '../../lib/paths.mts'
import {
  adaptAnPlusB,
  adaptSelectorInputs,
} from '../../../../test/repo/e2e/upstream/parsing.mts'
import type { WptEntry } from '../../../../test/repo/e2e/upstream/manifest.mts'

export function walkAst(
  node: AnyNode,
  visit: (node: AnyNode, ancestors: AnyNode[]) => void,
  ancestors: AnyNode[] = [],
) {
  visit(node, ancestors)
  const parents = [...ancestors, node]
  for (const value of Object.values(node)) {
    for (const child of Array.isArray(value) ? value : [value]) {
      if (
        child &&
        typeof child === 'object' &&
        typeof child.type === 'string'
      ) {
        walkAst(child as AnyNode, visit, parents)
      }
    }
  }
}

export function wptFile(url: string, root = REPO_ROOT) {
  const prefix = url.startsWith('/_repo/') ? '/_repo/' : '/'
  const base = prefix === '/' ? path.join(root, 'upstream/wpt') : root
  const file = path.resolve(base, url.slice(prefix.length))
  if (!file.startsWith(base + path.sep)) {
    throw new Error(`WPT resource escapes its checkout: ${url}`)
  }
  return file
}

export function scriptPage(url: string, source: string) {
  if (!url.endsWith('.window.html')) {
    throw new Error('Script wrappers require a .window.html path.')
  }
  const comments: string[] = []
  parse(source, {
    ecmaVersion: 'latest',
    onComment: (_block, comment) => {
      comments.push(comment)
    },
  })
  if (comments.some(comment => comment.trimStart().startsWith('META:'))) {
    throw new Error('Review WPT script metadata before adding this wrapper.')
  }
  const script = url.slice(0, -5) + '.js'
  return `<!doctype html><meta charset="utf-8"><title>WPT selector script</title><script src="/resources/testharness.js"></script><script src="/resources/testharnessreport.js"></script><body><script src="${script}"></script>`
}

export interface SourceEdit {
  start: number
  end: number
  text: string
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

export function adaptDomOnly(
  source: string,
  mode: NonNullable<WptEntry['domOnly']>,
) {
  const adapters = {
    'form-validity': { edit: formValidityEdit, expected: 4 },
    'input-direction': { edit: directionEdit, expected: 3 },
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
    return scriptPage(entry.path, readFileSync(wptFile(script, root), 'utf8'))
  }
  const source = readFileSync(wptFile(entry.path, root), 'utf8')
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
