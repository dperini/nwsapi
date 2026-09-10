import type { AnyNode } from 'acorn'
import { parse } from 'acorn'
import path from 'node:path'
import { REPO_ROOT } from '../../lib/paths.mts'

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

export function scriptPage(
  url: string,
  source: string,
  reflectSwitch = false,
  dependencies: string[] = [],
  inline?: string,
) {
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
  const metadata = comments
    .map(comment => comment.trim())
    .filter(comment => comment.startsWith('META:'))
  if (
    JSON.stringify(metadata) !==
    JSON.stringify(dependencies.map(dependency => `META: script=${dependency}`))
  ) {
    throw new Error('Review WPT script metadata before adding this wrapper.')
  }
  const script = url.slice(0, -5) + '.js'
  const setup = reflectSwitch
    ? '<script src="/_repo/test/repo/e2e/upstream/fixtures/switch-idl.mts"></script>'
    : ''
  const helpers = dependencies
    .map(
      dependency =>
        `<script src="${new URL(dependency, 'http://wpt.test' + url).pathname}"></script>`,
    )
    .join('')
  return `<!doctype html><meta charset="utf-8"><title>WPT selector script</title><script src="/resources/testharness.js"></script><script src="/resources/testharnessreport.js"></script><body>${setup}${helpers}${inline === undefined ? `<script src="${script}"></script>` : `<script>${inline}</script>`}`
}

export function namedTest(node: AnyNode) {
  return node.type === 'ExpressionStatement' &&
    node.expression.type === 'CallExpression' &&
    node.expression.callee.type === 'Identifier' &&
    ['test', 'promise_test'].includes(node.expression.callee.name)
    ? node.expression
    : undefined
}

export function testName(node: AnyNode | undefined) {
  if (node?.type === 'Literal' && typeof node.value === 'string') {
    return node.value
  }
  if (node?.type === 'TemplateLiteral' && node.expressions.length === 0) {
    return node.quasis[0]?.value.cooked
  }
  return undefined
}
