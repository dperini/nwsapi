import { expect, test } from 'vitest'
import { inspectSelectorCalls } from '../../../../../scripts/repo/check/wpt/inventory.mts'
import {
  adaptSupports,
  scriptPage,
  selectTests,
  supportSelector,
} from '../../../../../scripts/repo/check/wpt/source/inspect.mts'
import { inspectScript } from '../../../../../scripts/repo/check/wpt/scope.mts'
import { JSDOM } from 'jsdom'

test('inventory counts AST calls and flags assertions without treating strings as code', () => {
  const report = inspectSelectorCalls(
    `
    // document.querySelector('comment')
    const text = "element.matches('string')"
    assert_true(element['matches'](':disabled'))
    document.querySelector('#fixture')
    test_invalid_selector(':not(')
  `,
    false,
  )
  expect(report.calls).toEqual({ matches: 1, querySelector: 1 })
  expect(report.assertions).toBe(1)
  expect(report.validity).toBe(1)
})

test('inventory reads inline modules and records unresolved scripts for review', () => {
  const report = inspectSelectorCalls(
    `<script src="/resources/testharness.js"></script><script src="/resources/testdriver.js"></script><script type="module">node.closest('.x')</script><script>???</script>`,
    true,
  )
  expect(report.harness).toBe(true)
  expect(report.testdriver).toBe(true)
  expect(report.calls).toEqual({ closest: 1 })
  expect(report.unparsed).toBe(1)
})

test('selected tests preserve assertions and reject changed upstream test counts', () => {
  const source = `<script>test(() => assert_true(node.matches(':enabled')), 'selectors'); test(() => assert_equals(getComputedStyle(node).color, 'red'), 'rendering')</script>`
  const selection = { total: 2, names: ['selectors'] }
  const dom = new JSDOM(selectTests(source, selection))
  try {
    const code = dom.window.document.scripts[0]!.textContent!
    expect(inspectScript(code, 'test.js').selectors).toBe(1)
    expect(inspectScript(code, 'test.js').issues).toEqual([])
    expect(code).toContain("assert_true(node.matches(':enabled'))")
  } finally {
    dom.window.close()
  }
  expect(() => selectTests(source, { ...selection, total: 3 })).toThrow(
    'Review upstream',
  )
  expect(() =>
    selectTests(source, { ...selection, names: ['missing'] }),
  ).toThrow('Review upstream')
})

test.each([
  ['selector(::picker(select))', '::picker(select)'],
  ['selector(::details-content:lang(en)', '::details-content:lang(en)'],
  ['selector([data-x=")"])', '[data-x=")"]'],
  ['selector(.a\\))', '.a\\)'],
])('extracts the selector token range from %s', (condition, selector) => {
  expect(supportSelector(condition)).toBe(selector)
})

test('support adapters keep upstream expectations and reject unrelated conditions', () => {
  const source = `<script>test(() => assert_equals(CSS.supports('selector(::picker())'), false), 'invalid')</script>`
  expect(adaptSupports(source, 1)).toContain(
    'selectorSyntaxAccepted("::picker()"), false',
  )
  expect(() => adaptSupports(source, 2)).toThrow('expected 2 inputs')
  expect(() => supportSelector('display: block')).toThrow('one selector()')
  expect(() => supportSelector('selector(div) and selector(p)')).toThrow(
    'compound support',
  )
})

test('window wrappers only admit explicitly reviewed script metadata', () => {
  const source = '// META: script=direction.js\ntest(() => {})'
  expect(
    scriptPage('/tests/example.window.html', source, false, ['direction.js']),
  ).toContain('src="/tests/direction.js"')
  expect(() => scriptPage('/tests/example.window.html', source)).toThrow(
    'metadata',
  )
  expect(() =>
    scriptPage('/tests/example.window.html', '// META: timeout=long', false, [
      'direction.js',
    ]),
  ).toThrow('metadata')
})
