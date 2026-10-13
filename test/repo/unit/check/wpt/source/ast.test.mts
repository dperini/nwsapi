import { parse } from 'acorn'
import { JSDOM } from 'jsdom'
import path from 'node:path'
import { expect, test } from 'vitest'
import { normalizePath } from '../../../../../../scripts/repo/lib/paths.mts'
import {
  namedTest,
  scriptPage,
  testName,
  walkAst,
  wptFile,
} from '../../../../../../scripts/repo/check/wpt/source/ast.mts'

test.each(['/checkout', 'checkout', path.resolve('checkout')])(
  'resolves repository and upstream resources under %s and rejects traversal',
  root => {
    expect(normalizePath(wptFile('/css/test.html', root))).toBe(
      normalizePath(path.resolve(root, 'upstream/wpt/css/test.html')),
    )
    expect(normalizePath(wptFile('/_repo/test/example.html', root))).toBe(
      normalizePath(path.resolve(root, 'test/example.html')),
    )
    expect(() => wptFile('/../../outside', root)).toThrow()
    expect(() => wptFile('/_repo/../outside', root)).toThrow()
  },
)

test('script wrappers preserve dependencies, setup and inline source as parsed HTML', () => {
  const html = scriptPage(
    '/css/example.window.html',
    '// META: script=../helper.js',
    true,
    ['../helper.js'],
    'test(() => {}, "inline")',
  )
  const dom = new JSDOM(html)
  try {
    expect(
      Array.from(dom.window.document.scripts, script =>
        script.getAttribute('src'),
      ),
    ).toEqual([
      '/resources/testharness.js',
      '/resources/testharnessreport.js',
      '/_repo/test/repo/e2e/fixture/upstream/switch-idl.mts',
      '/helper.js',
      null,
    ])
    expect(dom.window.document.scripts[4]?.textContent).toBe(
      'test(() => {}, "inline")',
    )
  } finally {
    dom.window.close()
  }
  const external = new JSDOM(
    scriptPage('/css/example.window.html', 'test(() => {}, "external")'),
  )
  try {
    expect(external.window.document.scripts[2]?.getAttribute('src')).toBe(
      '/css/example.window.js',
    )
  } finally {
    external.window.close()
  }
  expect(() => scriptPage('/invalid.html', '')).toThrow()
  expect(() =>
    scriptPage('/example.window.html', '// META: timeout=long'),
  ).toThrow()
})

test('AST traversal identifies literal and static template test registrations', () => {
  const ast = parse(
    'test(() => {}, "literal"); promise_test(() => {}, `template`); other();',
    {
      ecmaVersion: 'latest',
    },
  )
  const names: Array<string | undefined | null> = []
  const ancestors: string[][] = []
  walkAst(ast, (node, parents) => {
    const call = namedTest(node)
    if (call) {
      names.push(testName(call.arguments[1]))
      ancestors.push(parents.map(parent => parent.type))
    }
  })
  expect(names).toEqual(['literal', 'template'])
  expect(ancestors).toEqual([['Program'], ['Program']])
  expect(testName(undefined)).toBeUndefined()
  const dynamic = parse('`hello ${name}`', { ecmaVersion: 'latest' }).body[0]
  expect(testName(dynamic)).toBeUndefined()
})
