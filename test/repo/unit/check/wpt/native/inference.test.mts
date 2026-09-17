import { expect, test } from 'vitest'
import {
  inferScripts,
  inferCase,
  matchesTitle,
  titleParts,
} from '../../../../../../scripts/repo/check/wpt/native/inference.mts'
import {
  manifestSources,
  pageMetadata,
} from '../../../../../../scripts/repo/check/wpt/native/metadata.mts'
import { parse } from 'acorn'

const classify = (source: string, title: string) =>
  inferCase(title, inferScripts([{ source, file: '/case.js' }]).profiles)
    ?.category

test('generated titles preserve fixed text and allow dynamic values', () => {
  const ast = parse('`case ${name}: ${selector}`', { ecmaVersion: 'latest' })
  const statement = ast.body[0]!
  if (statement.type !== 'ExpressionStatement') {
    throw new Error('Expected title expression.')
  }
  const parts = titleParts(statement.expression)
  expect(matchesTitle(parts, 'case div: :has(.x)')).toBe(true)
  expect(matchesTitle(parts, 'unrelated div: :has(.x)')).toBe(false)
})

test('selector values flow through local variables and shared helpers', () => {
  expect(
    classify(
      `function check(root) { const actual = root.querySelectorAll('.x'); assert_equals(actual.length, 2); } test(() => check(document), 'generated ' + name);`,
      'generated deep',
    ),
  ).toBe('selector-matching')
  expect(
    classify(
      `test(() => { const fixture = document.querySelector('.x'); assert_equals(fixture.textContent, 'hello'); }, 'fixture');`,
      'fixture',
    ),
  ).toBe('other-api')
})

test('mixed rendering stays explicit and syntax exceptions count as parsing', () => {
  expect(
    classify(
      `test(() => { assert_true(node.matches('x')); assert_equals(getComputedStyle(node).color, 'red'); }, 'mixed');`,
      'mixed',
    ),
  ).toBe('mixed-selector')
  expect(
    classify(
      `test(() => assert_throws_dom('SyntaxError', () => document.querySelector(':bad')), 'syntax');`,
      'syntax',
    ),
  ).toBe('selector-parsing')
})

test('native manifest URL variants normalize to report URLs', () => {
  const sources = manifestSources({
    testharness: {
      dom: {
        'case.html': [
          'blob',
          ['dom/case.html?a', {}],
          ['/dom/case.html?b', {}],
        ],
      },
    },
  })
  expect([...sources.keys()]).toEqual(['/dom/case.html?a', '/dom/case.html?b'])
})

test('XML scripts use XML parsing for CDATA and entities', () => {
  const metadata = pageMetadata(
    '<html xmlns="http://www.w3.org/1999/xhtml"><script><![CDATA[test(() => assert_true(1 < 2), "xml");]]></script></html>',
    'case.xhtml',
  )
  expect(metadata.scripts).toEqual(['test(() => assert_true(1 < 2), "xml");'])
})

test('title matching handles repeated delimiters and literal regex characters', () => {
  expect(matchesTitle(['case "', null, '"'], 'case "a "quoted" value"')).toBe(
    true,
  )
  expect(matchesTitle(['[value].', null], '[value].\nǃ')).toBe(true)
  expect(matchesTitle(['[value].', null], 'vX')).toBe(false)
})

test('selectors used as expected values and custom assertion inputs do not change the tested API', () => {
  expect(
    classify(
      `test(() => assert_equals(document.elementFromPoint(0, 0), document.querySelector('html')), 'hit test');`,
      'hit test',
    ),
  ).toBe('rendering')
  expect(
    classify(
      `function assert_ratio(element) { assert_equals(getComputedStyle(element).width, '20px') } test(() => assert_ratio(document.querySelector('img')), 'size');`,
      'size',
    ),
  ).toBe('rendering')
})

test('single_test setup preserves top-level selector assertions', () => {
  expect(
    classify(
      `setup({ single_test: true }); assert_equals(document.querySelector('a'), null); done();`,
      'page title',
    ),
  ).toBe('selector-matching')
})

test('callback-free async registrations use their deferred assertions and registered title', () => {
  expect(
    classify(
      `const pending = async_test('script executes'); test(() => assert_true(node.matches('x')), 'selector'); pending.done();`,
      'script executes',
    ),
  ).toBe('other-api')
  expect(
    classify(
      `const pending = async_test('frame'); window.addEventListener('message', () => pending.step(() => assert_equals(frame.URL, expected), 'step message'));`,
      'frame',
    ),
  ).toBe('other-api')
  expect(
    classify(
      `const pending = async_test(); window.addEventListener('load', () => pending.step(() => assert_true(node.matches('x')), 'step message'));`,
      'page title',
    ),
  ).toBe('selector-matching')
})

test('literal inserted scripts are parsed while import maps remain data', () => {
  const source = `<script>const moduleScript = document.createElement('script'); moduleScript.type = 'module'; moduleScript.innerHTML = \`test(() => assert_true(node.matches('x')), 'inserted');\`; const map = document.createElement('script'); map.type = 'importmap'; map.textContent = '{"imports": {}}';</script>`
  const metadata = pageMetadata(source, 'case.html')
  expect(metadata.scripts).toHaveLength(2)
  expect(classify(metadata.scripts[1]!, 'inserted')).toBe('selector-matching')
})

test('metadata follows forwarded iframe tests and literal dynamic script URLs', () => {
  const metadata = pageMetadata(
    `<iframe src="child.html"></iframe><script>const files = ['one.js', 'two.js']; fetch_tests_from_window(frame.contentWindow); const script = document.createElement('script'); script.src = 'helper.js';</script>`,
    'case.html',
  )
  expect(metadata.dependencies).toEqual([
    'helper.js',
    'child.html',
    'one.js',
    'two.js',
  ])
})

test('selector collection transformations and returned helpers retain selector provenance', () => {
  expect(
    classify(
      `function ids(items) { return items.map(node => node.id).sort().join(); } test(() => { const actual = Array.from(document.querySelectorAll('div')); assert_equals(ids(actual), 'a,b'); }, 'ids');`,
      'ids',
    ),
  ).toBe('selector-matching')
  expect(
    classify(
      `function getIDs() { return [...document.querySelectorAll('a')].map(node => node.id); } test(() => assert_array_equals(getIDs(), ['a']), 'ids');`,
      'ids',
    ),
  ).toBe('selector-matching')
  expect(
    classify(
      `test(() => { const matches = document.querySelectorAll(':enabled'); for (const element of matches) assert_true(element.id.endsWith('_enabled')); }, 'loop');`,
      'loop',
    ),
  ).toBe('selector-matching')
})

test('forwarded method names and reversed constant comparisons remain selector cases', () => {
  expect(
    classify(
      `function check(method) { test(() => assert_true(node[method]('x')), 'alias'); } function init(method) { check(method); } init('matches');`,
      'alias',
    ),
  ).toBe('selector-matching')
  expect(
    classify(
      `function check(expected) { test(() => assert_equals(expected, node.matches('x')), 'reversed'); } check(true);`,
      'reversed',
    ),
  ).toBe('selector-matching')
  expect(
    classify(
      `test(() => assert_true(Element.prototype.matches.call(node, 'x')), 'uncurried');`,
      'uncurried',
    ),
  ).toBe('selector-matching')
})

test('helper parameters retain query results without treating fixture properties as selector assertions', () => {
  expect(
    classify(
      `function assert_singleton(items, expected) { assert_equals(items.length, 1); assert_equals(items[0], expected); } test(() => assert_singleton(document.querySelectorAll('x'), node), 'singleton');`,
      'singleton',
    ),
  ).toBe('selector-matching')
})

test('unasserted queries establish syntax acceptance', () => {
  expect(
    classify(
      `test(() => { document.querySelector(':state(x)'); }, 'valid');`,
      'valid',
    ),
  ).toBe('selector-parsing')
  expect(
    classify(
      `test(() => { try { document.querySelector(':empty'); } catch { assert_unreached('no exception'); } }, 'valid');`,
      'valid',
    ),
  ).toBe('selector-parsing')
})

test('frame messages preserve selector comparisons only when the resolved sender tests selectors', () => {
  const receiver = `async_test(t => { window.addEventListener('message', t.step_func_done(event => assert_equals(event.data, 'PASS'))); }, 'target');`
  const inputs = [
    { file: '/parent.html', source: receiver },
    {
      file: '/child.html',
      source: `window.addEventListener('load', () => parent.postMessage(document.querySelector(':target') === target ? 'PASS' : 'FAIL', '*'));`,
    },
  ]
  expect(inferCase('target', inferScripts(inputs).profiles)?.category).toBe(
    'selector-matching',
  )
  inputs[1]!.source = `parent.postMessage(document.title, '*');`
  expect(inferCase('target', inferScripts(inputs).profiles)?.category).toBe(
    'other-api',
  )
  inputs[1]!.source = `document.querySelector(':empty'); parent.postMessage(document.title, '*');`
  expect(inferCase('target', inferScripts(inputs).profiles)?.category).toBe(
    'other-api',
  )
  const metadata = pageMetadata(
    `<script>const frame = document.createElement('iframe'); frame.src = 'child.html'; window.addEventListener('message', handler);</script>`,
    'parent.html',
  )
  expect(metadata.dependencies).toEqual(['child.html'])
})
