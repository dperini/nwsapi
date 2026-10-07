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

test('registration inference resolves callable aliases and skips unresolved callbacks', () => {
  const result = inferScripts([
    {
      file: '/callbacks.js',
      source:
        'const callback = () => assert_true(node.matches("div")); test(callback, "alias"); test(missing, "missing"); test(123, "literal"); (() => {})(); node[0]()',
    },
  ])
  expect(result.profiles.map(profile => profile.parts)).toEqual([['alias']])
  expect(result.profiles[0]?.category).toBe('selector-matching')
})

test('callback-free async registrations resolve chained and named deferred callbacks', () => {
  const result = inferScripts([
    {
      file: '/async.js',
      source:
        'const callback = () => assert_true(node.matches("div")); async_test("chained").step(callback); async_test().step(() => assert_true(node.matches("p"))); const t = async_test("named"); t.step(callback); t.step(missing); t.other(callback); t[0](); other.step(callback); const { value } = async_test("destructured");',
    },
  ])
  expect(inferCase('chained', result.profiles)?.category).toBe(
    'selector-matching',
  )
  expect(inferCase('named', result.profiles)?.category).toBe(
    'selector-matching',
  )
  expect(result.profiles.some(profile => profile.unnamed)).toBe(true)
})

test('standard parsing helpers override CSSOM signals and anonymous owners remain ordinary callbacks', () => {
  const parser = inferScripts([
    {
      file: '/css/support/parsing-testcommon.js',
      source:
        'function test_valid_selector(selector) { test(() => assert_equals(sheet.cssRules.length, 1), "valid") } function other() { test(() => assert_true(true), "other") } test(() => assert_true(true), "top")',
    },
  ])
  expect(inferCase('valid', parser.profiles)?.category).toBe('selector-parsing')
  expect(inferCase('other', parser.profiles)?.category).toBe('other-api')
  const anonymous = inferScripts([
    {
      file: '/anonymous.mjs',
      source:
        'export default function() { test(() => assert_true(node.matches("div")), "anonymous") }',
    },
  ])
  expect(inferCase('anonymous', anonymous.profiles)?.category).toBe(
    'selector-matching',
  )
  expect(
    classify(
      'test(() => { assert_true(node.matches("div")); getComputedStyle(node) }, "mixed")',
      'mixed',
    ),
  ).toBe('mixed-selector')
})

test('forwarded selector messages upgrade only callbacks that assert message data', () => {
  const result = inferScripts([
    {
      file: '/messages.js',
      source:
        'postMessage(node.matches("div")); test(() => assert_equals(event.data, true), "message"); test(() => assert_equals(node.textContent, "text"), "text")',
    },
  ])
  expect(inferCase('message', result.profiles)?.category).toBe(
    'selector-matching',
  )
  expect(inferCase('text', result.profiles)?.category).toBe('other-api')
  expect(
    inferScripts([{ file: '', source: 'assert_true(true)' }]).fallback?.file,
  ).toBe('')
})

test('ambiguous generated titles merge compatible categories and reject mixed scope', () => {
  const profiles = (source: string) =>
    inferScripts([{ file: '/titles.js', source }]).profiles
  const selectors = profiles(
    'test(() => assert_true(node.matches("div")), "same"); test(() => assert_throws_dom("SyntaxError", () => node.matches(":bad")), "same")',
  )
  expect(inferCase('same', selectors)?.category).toBe('selector-matching')
  const other = profiles(
    'test(() => assert_equals(getComputedStyle(node).color, "red"), "same"); test(() => assert_equals(sheet.cssRules.length, 1), "same"); test(() => assert_equals(node.textContent, "text"), "same")',
  )
  expect(inferCase('same', other)?.category).toBe('other-api')
  expect(inferCase('missing', other)).toBeUndefined()
  expect(inferCase('same', [...selectors, ...other])).toBeUndefined()
})

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
