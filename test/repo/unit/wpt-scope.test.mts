import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { expect, test } from 'vitest'
import {
  inspectScript,
  inspectWptScope,
  resourceUrl,
} from '../../../scripts/repo/check/wpt/scope.mts'
import {
  adaptDomOnly,
  scriptPage,
  wptFile,
} from '../../../scripts/repo/check/wpt/source.mts'

test.each([
  'assert_equals(getComputedStyle(el).color, "red")',
  'assert_equals(el["offsetWidth"], 20)',
  'const rect = el.getBoundingClientRect()',
  'const read = window.getComputedStyle; assert_equals(read(el).color, "red")',
  'const { getComputedStyle: read } = window',
  'assert_equals(el[`clientHeight`], 20)',
  'test_driver.click(el)',
  'assert_equals(sheet.cssRules[0].selectorText, "div")',
  'assert_equals(root.styleSheets[0].title, null)',
])('rejects rendering and native stylesheet checks: %s', source => {
  expect(inspectScript(source, 'fixture.js').issues.length).toBeGreaterThan(0)
})

test('allows discarded layout flushes and ignores comments and string contents', () => {
  const result = inspectScript(
    `
    // getComputedStyle is outside the assertions in this fixture.
    const label = "test_driver and offsetWidth";
    el.offsetTop;
    void el.getBoundingClientRect();
    assert_true(el.matches('.item'), label);
  `,
    'fixture.js',
  )
  expect(result.issues).toEqual([])
  expect(result.selectors).toBe(1)
})

test('follows literal imports and rejects dependencies that cannot be inspected', () => {
  const result = inspectScript(
    `
    import './shared.js';
    export { helper } from './helper.js';
    import('./lazy.js');
    import(modulePath);
    document.createElement('script');
  `,
    'fixture.js',
    true,
  )
  expect(result.imports).toEqual(['./shared.js', './helper.js', './lazy.js'])
  expect(result.issues.map(issue => issue.reason)).toEqual([
    'Dynamic module paths cannot be inspected.',
    'Use a static script dependency so the scope check can inspect it.',
  ])
  expect(() => inspectScript('const =', 'broken.js')).toThrow('broken.js')
  expect(inspectScript('const size: number = 1', 'helper.mts').issues).toEqual(
    [],
  )
})

test('checks external helpers, event handlers, and nested frame fixtures', t => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'nwsapi-wpt-scope-'))
  t.onTestFinished(() => rmSync(root, { recursive: true }))
  const write = (name: string, source: string) => {
    const file = path.join(root, 'upstream/wpt', name)
    mkdirSync(path.dirname(file), { recursive: true })
    writeFileSync(file, source)
  }
  write(
    'page.html',
    `
    <script src="/resources/testharness.js"></script>
    <script src="./helper.js"></script>
    <script>document.querySelector('p')</script>
    <body onload="assert_equals(this.offsetWidth, 5)">
    <iframe src="frame.html"></iframe>
    <iframe srcdoc="&lt;script&gt;assert_equals(el.clientHeight, 5)&lt;/script&gt;"></iframe>
  `,
  )
  write('helper.js', 'assert_equals(getComputedStyle(el).color, "red")')
  write('frame.html', '<script src="nested.js"></script>')
  write('nested.js', 'assert_equals(el.getClientRects().length, 1)')
  const result = inspectWptScope(
    [{ path: '/page.html', note: 'Scope fixture.' }],
    root,
  )
  expect(result.issues.map(issue => issue.file).toSorted()).toEqual([
    '/helper.js',
    '/nested.js',
    '/page.html#onload',
    '/page.html#script-1',
  ])
  expect(result.scripts).toBe(2)
})

test('rejects reftests, testdriver dependencies, and pages without selector calls', t => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'nwsapi-wpt-scope-'))
  t.onTestFinished(() => rmSync(root, { recursive: true }))
  mkdirSync(path.join(root, 'upstream/wpt'), { recursive: true })
  writeFileSync(
    path.join(root, 'upstream/wpt/page.html'),
    `
    <link rel="match" href="reference.html">
    <script src="/resources/testdriver.js"></script>
  `,
  )
  const result = inspectWptScope(
    [{ path: '/page.html', note: 'Rejected fixture.' }],
    root,
  )
  expect(result.issues.map(issue => issue.reason)).toEqual([
    'Reftests require rendering comparison.',
    'testdriver dependency: /resources/testdriver.js',
    'No testharness dependency was found.',
    'No selector API calls were found in the page or its helpers.',
  ])
})

test('restricts resource paths and refuses unreviewed window-script metadata', () => {
  expect(resourceUrl('../helper.js', '/tests/page.html')).toBe('/helper.js')
  expect(() =>
    resourceUrl('https://other.test/helper.js', '/page.html'),
  ).toThrow('External WPT script')
  expect(() => wptFile('/../outside.js')).toThrow('escapes its checkout')
  expect(scriptPage('/tests/example.window.html', 'test(() => {})')).toContain(
    'src="/tests/example.window.js"',
  )
  expect(() => scriptPage('/example.html', '')).toThrow('.window.html')
  expect(() =>
    scriptPage('/example.window.html', '// META: script=helper.js'),
  ).toThrow('metadata')
})

test('keeps matching assertions when removing the reviewed direction checks', () => {
  const source = `<script>
    assert_true(input.matches(':dir(ltr)'));
    assert_equals(getComputedStyle(input).direction, 'ltr');
    assert_equals(getComputedStyle(input).direction, 'ltr');
    assert_equals(getComputedStyle(input).direction, 'ltr');
  </script>`
  const adapted = adaptDomOnly(source, 'input-direction')
  expect(adapted).toContain("assert_true(input.matches(':dir(ltr)'))")
  expect(adapted).not.toContain('getComputedStyle')
  expect(() =>
    adaptDomOnly('<script>test(() => {})</script>', 'input-direction'),
  ).toThrow('expected 3 edits')
  expect(() =>
    adaptDomOnly(
      '<script>const result = getComputedStyle(input)</script>',
      'input-direction',
    ),
  ).toThrow('assertions changed')
})
