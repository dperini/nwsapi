import { parse, type AnyNode } from 'acorn'
import { JSDOM } from 'jsdom'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { expect, test } from 'vitest'
import {
  adaptDomOnly,
  adaptSupports,
  definedEdit,
  directionEdit,
  dynamicDirectionEdit,
  formValidityEdit,
  inertEdit,
  namespaceEdit,
  nodeListEdit,
  pageContentType,
  pageSource,
  selectTests,
  supportSelector,
  webkitEdit,
  walkAst,
} from '../../../../../../scripts/repo/check/wpt/source/inspect.mts'

const statement = (source: string) =>
  parse(source, { ecmaVersion: 'latest' }).body[0]!

function scriptSource(html: string) {
  const dom = new JSDOM(html)
  try {
    return Array.from(dom.window.document.scripts, script => script.textContent)
      .filter(Boolean)
      .join('\n')
  } finally {
    dom.window.close()
  }
}

test('page loading applies requested source adapters before the harness runs', t => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'nwsapi-page-source-'))
  t.onTestFinished(() => rmSync(root, { recursive: true, force: true }))
  const file = path.join(root, 'page.html')
  const entry = { path: '/_repo/page.html', note: 'Fixture' }
  writeFileSync(file, '<p>plain</p>')
  expect(pageSource(entry, root)).toBe('<p>plain</p>')
  writeFileSync(file, '<script>CSS.supports("selector(div)")</script>')
  expect(
    parse(scriptSource(pageSource({ ...entry, supportsInputs: 1 }, root)), {
      ecmaVersion: 'latest',
    }).body,
  ).toHaveLength(1)
  writeFileSync(
    file,
    '<script>test(() => {}, "selected"); test(() => {}, "other")</script>',
  )
  expect(
    parse(
      scriptSource(
        pageSource(
          { ...entry, selectorTests: { names: ['selected'], total: 2 } },
          root,
        ),
      ),
      { ecmaVersion: 'latest' },
    ).body,
  ).toHaveLength(1)
  writeFileSync(
    file,
    '<script>test_valid_selector("div"); rendering()</script>',
  )
  expect(
    parse(scriptSource(pageSource({ ...entry, selectorInputs: 1 }, root)), {
      ecmaVersion: 'latest',
    }).body,
  ).toHaveLength(1)
  writeFileSync(file, '<script>color = "red"; test(() => {}, "kept")</script>')
  expect(
    parse(scriptSource(pageSource({ ...entry, domOnly: 'inert' }, root)), {
      ecmaVersion: 'latest',
    }).body,
  ).toHaveLength(1)
  writeFileSync(path.join(root, 'page.window.js'), 'test(() => {}, "kept")')
  const scriptEntry = {
    path: '/_repo/page.window.html',
    note: 'Fixture',
    script: true,
  }
  const dom = new JSDOM(pageSource(scriptEntry, root))
  try {
    expect(dom.window.document.scripts[2]?.getAttribute('src')).toBe(
      '/_repo/page.window.js',
    )
  } finally {
    dom.window.close()
  }
  writeFileSync(
    path.join(root, 'page.window.js'),
    'color = "red"; test(() => {}, "kept")',
  )
  expect(
    parse(
      scriptSource(pageSource({ ...scriptEntry, domOnly: 'inert' }, root)),
      { ecmaVersion: 'latest' },
    ).body,
  ).toHaveLength(1)
  writeFileSync(
    path.join(root, 'parse-anplusb.html'),
    '<script>function assert_selector_serializes_to(source) {} function assert_invalid_selector(source) {}</script>',
  )
  expect(
    parse(
      scriptSource(
        pageSource(
          { path: '/_repo/parse-anplusb.html', note: 'Fixture' },
          root,
        ),
      ),
      { ecmaVersion: 'latest' },
    ).body,
  ).toHaveLength(2)
})

test('selects named registrations while preserving setup and external resources', () => {
  const html =
    '<script src="external.js"></script><script></script><script>const setup = 1; test(() => {}, "keep"); test(() => {}, "drop"); promise_test(() => {}, `also keep`)</script>'
  const selected = selectTests(html, { total: 3, names: ['keep', 'also keep'] })
  const program = parse(scriptSource(selected), { ecmaVersion: 'latest' })
  expect(program.body).toHaveLength(3)
  expect(() => selectTests(html, { total: 4, names: ['keep'] })).toThrow()
  expect(() => selectTests(html, { total: 3, names: ['missing'] })).toThrow()
})

test('adapts a selector support condition with nested functions and rejects changed APIs', () => {
  expect(supportSelector('selector(:is(a, :has(b)))')).toBe(':is(a, :has(b))')
  expect(() => supportSelector('(display: flex)')).toThrow()
  expect(() => supportSelector('selector(div) and (display: flex)')).toThrow()
  const result = adaptSupports(
    '<script src="external.js"></script><script></script><script>const a = CSS.supports("selector(:has(*))"); other.supports("ignored")</script>',
    1,
  )
  const program = parse(scriptSource(result), { ecmaVersion: 'latest' })
  const calls: string[] = []
  walkAst(program, node => {
    if (node.type === 'CallExpression' && node.callee.type === 'Identifier') {
      calls.push(node.callee.name)
    }
  })
  expect(calls).toEqual(['selectorSyntaxAccepted'])
  expect(() =>
    adaptSupports('<script>CSS.supports("color", "red")</script>', 1),
  ).toThrow()
  expect(() =>
    adaptSupports('<script>CSS.supports(value)</script>', 1),
  ).toThrow()
  expect(() => adaptSupports('<script>const a = 1</script>', 1)).toThrow()
})

test('defined-state adaptation requires the known assertion callback shape', () => {
  const node = statement(
    'function test_defined() { test(() => { a(); b(); c(); d(); e(); f() }) }',
  )
  const edit = definedEdit(node)!
  const source =
    'function test_defined() { test(() => { a(); b(); c(); d(); e(); f() }) }'
  const edited = parse(source.slice(0, edit.start) + source.slice(edit.end), {
    ecmaVersion: 'latest',
  })
  const fn = edited.body[0]
  expect(fn?.type).toBe('FunctionDeclaration')
  expect(definedEdit(statement('function other() {}'))).toBeUndefined()
  expect(() =>
    definedEdit(statement('function test_defined() { const value = 1 }')),
  ).toThrow()
  expect(() =>
    definedEdit(statement('function test_defined() { test(() => {}) }')),
  ).toThrow()
})

test('DOM adapters remove only the reviewed rendering statements', () => {
  expect(
    dynamicDirectionEdit(statement('const acs = getComputedStyle(e)')),
  ).toBeDefined()
  expect(
    dynamicDirectionEdit(statement('assert_equals(acs.direction, "rtl")')),
  ).toBeDefined()
  expect(
    dynamicDirectionEdit(statement('assert_equals(other.direction, "rtl")')),
  ).toBeUndefined()
  expect(inertEdit(statement('color = "red"'))).toBeDefined()
  expect(inertEdit(statement('other = "red"'))).toBeUndefined()
  expect(formValidityEdit(statement('function getBGColor() {}'))).toBeDefined()
  expect(
    formValidityEdit(statement('test(testStyles.bind(null), "style")')),
  ).toBeDefined()
  expect(
    formValidityEdit(statement('test(() => {}, "selector")')),
  ).toBeUndefined()
  expect(formValidityEdit(statement('const x = 1'))).toBeUndefined()
  expect(namespaceEdit(statement('const x = 1'))).toBeUndefined()
  const namespace: AnyNode[] = []
  walkAst(
    parse('["matches", "webkitMatchesSelector"]; element[method]("div")', {
      ecmaVersion: 'latest',
    }),
    node => {
      if (namespaceEdit(node)) {
        namespace.push(node)
      }
    },
  )
  expect(namespace).toHaveLength(2)
  expect(
    webkitEdit(
      statement(
        'test(() => {}, "rules include webkit-prefixed pseudo-element should be cascaded")',
      ),
    ),
  ).toBeDefined()
  expect(
    webkitEdit(statement('assert_equals(sheet.cssRules.length, 1)')),
  ).toBeDefined()
  expect(webkitEdit(statement('object.test()'))).toBeUndefined()
  expect(webkitEdit(statement('test(() => {}, "other")'))).toBeUndefined()
  expect(webkitEdit(statement('const x = 1'))).toBeUndefined()
  expect(
    nodeListEdit(
      statement(
        'test(() => {}, "live NodeLists are for-of iterable and update appropriately")',
      ),
    ),
  ).toBeDefined()
  expect(nodeListEdit(statement('test(() => {}, "other")'))).toBeUndefined()
})

test('direction adaptation rejects computed-style use outside reviewed assertions', () => {
  let found = 0
  walkAst(
    parse('assert_equals(getComputedStyle(e).direction, "rtl")', {
      ecmaVersion: 'latest',
    }),
    (node, ancestors) => {
      if (directionEdit(node, ancestors)) {
        found += 1
      }
    },
  )
  expect(found).toBe(1)
  expect(() =>
    directionEdit(
      { type: 'Identifier', name: 'getComputedStyle' } as AnyNode,
      [],
    ),
  ).toThrow()
})

test('DOM-only adaptation checks edit counts and retains selector assertions', () => {
  const adapted = adaptDomOnly(
    '<script src="external.js"></script><script></script><script>color = "red"; test(() => document.querySelector("div"), "selector")</script>',
    'inert',
  )
  const body = parse(scriptSource(adapted), { ecmaVersion: 'latest' }).body
  expect(body).toHaveLength(1)
  expect(body[0]?.type).toBe('ExpressionStatement')
  expect(() => adaptDomOnly('<script>const x = 1</script>', 'inert')).toThrow()
  expect(pageContentType('/page.xhtml')).toBe('application/xhtml+xml')
  expect(pageContentType('/page.html')).toBe('text/html')
})
