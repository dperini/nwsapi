import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'
import type { TestContext } from 'node:test'

const require = createRequire(import.meta.url)
const { parse } = require('acorn')
const root = new URL('../../../', import.meta.url)
const source =
  process.env['NWSAPI_TEST_SOURCE'] ||
  fileURLToPath(new URL('src/nwsapi.js', root))
const factory = require(source)
const jsdomRequire = createRequire(require.resolve('jsdom'))
const enginePath = jsdomRequire.resolve('nwsapi')
jsdomRequire(enginePath)
require.cache[enginePath].exports = factory
const { JSDOM } = require('jsdom')

function fixture(t: TestContext, html: string) {
  const dom = new JSDOM('<!doctype html>' + html)
  t.after(() => dom.window.close())
  return {
    window: dom.window,
    document: dom.window.document,
    engine: factory(dom.window),
  }
}

test('the maintenance runtime retains the released ES2015 syntax baseline', () => {
  assert.doesNotThrow(() =>
    parse(readFileSync(source, 'utf8'), { ecmaVersion: 2015 }),
  )
})

test('forgiving lists retain valid items and honor configuration changes', t => {
  const { document, engine } = fixture(t, '<div id="a"></div><p id="b"></p>')
  for (const selector of [
    ':is(:unknown, div)',
    ':where(div, :unknown)',
    'div:not(:is(svg|div))',
  ]) {
    for (let pass = 0; pass < 2; pass += 1) {
      assert.deepEqual(
        engine.select(selector).map(node => node.id),
        ['a'],
        selector,
      )
      assert.equal(
        engine.first(selector),
        document.getElementById('a'),
        selector,
      )
      assert.equal(
        engine.match(selector, document.getElementById('a')),
        true,
        selector,
      )
    }
  }
  engine.configure({ FORGIVING: false })
  assert.throws(() => engine.select(':is(:unknown, div)'), {
    name: 'SyntaxError',
  })
  engine.configure({ FORGIVING: true })
  assert.equal(engine.select(':is(:unknown, div)').length, 1)
})

test('nested logical selectors and EOF-closed arguments keep their boundaries', t => {
  const { engine } = fixture(t, '<div id="a" class="a"></div><p id="b"></p>')
  for (const [selector, expected] of [
    [':not(:is(div))', ['html', 'head', 'body', 'b']],
    ['div:not([missing]', ['a']],
    ['div[class="a"', ['a']],
    [':is([class="a,b"], p)', ['b']],
  ]) {
    assert.deepEqual(
      engine.select(selector).map(node => node.id || node.localName),
      expected,
      selector,
    )
  }
})

test('quoted attributes after pseudo-classes survive sibling combinators', t => {
  const { engine } = fixture(t, '<i class="a">x</i><b id="hit" class="b"></b>')
  const selector = "[class*='a' i]:not(:empty) + [class*='b']"
  assert.deepEqual(
    engine.select(selector).map(node => node.id),
    ['hit'],
  )
})

test('malformed strings throw DOM syntax errors and escaped newlines continue strings', t => {
  const { window, document, engine } = fixture(
    t,
    '<p id="hit" data-value="ab"></p>',
  )
  const node = document.getElementById('hit')
  for (const selector of [
    '[data-value="a\nb"]',
    '[data-value="a\rb"]',
    'p]',
    ':is(p])',
  ]) {
    assert.throws(
      () => engine.select(selector),
      error =>
        error instanceof window.DOMException && error.name === 'SyntaxError',
    )
    assert.throws(() => engine.match(selector, node), { name: 'SyntaxError' })
  }
  assert.equal(engine.first('[data-value="a\\\nb"]'), node)
  assert.equal(engine.first('[data-value="a\\\r\nb"]'), node)
})

test('escaped attribute values are not mistaken for candidate tag names', t => {
  const { document, engine } = fixture(t, '<p id="hit"></p>')
  const node = document.getElementById('hit')
  node.setAttribute('data-value', '\\')
  for (const selector of [
    '[data-value=\\\\]',
    'p[data-value=\\\\]',
    '[data-value="\\\\"]',
  ]) {
    assert.deepEqual(engine.select(selector), [node], selector)
    assert.equal(engine.first(selector), node, selector)
    assert.equal(engine.match(selector, node), true, selector)
  }
})

test('relative has selectors anchor each branch to the subject', t => {
  const { document, engine } = fixture(
    t,
    '<main><i id="a"></i><b id="b"><em></em></b><i id="c"></i></main>',
  )
  for (let pass = 0; pass < 2; pass += 1) {
    for (const [selector, expected] of [
      ['i:has(+ b)', ['a']],
      ['i:has(+ b > em)', ['a']],
      ['i:has(~ b)', ['a']],
      ['i:has(~ a)', []],
      ['i:has(+ .missing, ~ b)', ['a']],
      ['main:has(> i)', ['main']],
      ['i:has(main b)', []],
    ]) {
      assert.deepEqual(
        engine.select(selector).map(node => node.id || node.localName),
        expected,
        selector,
      )
    }
    assert.equal(
      engine.match('i:has(~ b)', document.getElementById('c')),
      false,
    )
    assert.equal(engine.match(':has(+ b)', document.documentElement), false)
    assert.equal(engine.match('i', document.getElementById('c')), true)
  }
  document.getElementById('b').remove()
  assert.deepEqual(engine.select('i:has(~ b)'), [])
})

test('disabled fieldsets respect first legends and remain complementary after mutations', t => {
  const { document, engine } = fixture(
    t,
    '<fieldset disabled id="f"><legend><input id="legend"></legend><input id="child"><fieldset><legend><input id="nested"></legend></fieldset></fieldset>',
  )
  for (const id of ['child', 'nested']) {
    const node = document.getElementById(id)
    assert.equal(engine.match(':disabled', node), true, id)
    assert.equal(engine.match(':enabled', node), false, id)
    assert.equal(engine.match(':read-write', node), false, id)
  }
  assert.equal(
    engine.match(':enabled', document.getElementById('legend')),
    true,
  )
  document.getElementById('f').disabled = false
  assert.equal(engine.match(':enabled', document.getElementById('child')), true)
  assert.equal(
    engine.match(':disabled', document.getElementById('child')),
    false,
  )
})

test('required and optional states only apply to eligible controls', t => {
  const { document, engine } = fixture(
    t,
    '<input id="text" required><input id="hidden" type="hidden" required><input id="range" type="range" required><button id="button"></button><input-extra id="fake" required></input-extra>',
  )
  for (const id of ['hidden', 'range', 'button']) {
    const node = document.getElementById(id)
    assert.equal(engine.match(':required', node), false, id)
    assert.equal(engine.match(':optional', node), true, id)
  }
  assert.equal(engine.match(':required', document.getElementById('text')), true)
  assert.equal(
    engine.match(':optional', document.getElementById('fake')),
    false,
  )
})

test('fieldsets with no invalid controls are valid', t => {
  const { document, engine } = fixture(
    t,
    '<fieldset id="empty"></fieldset><fieldset id="disabled" disabled><input required></fieldset><fieldset id="invalid"><input required></fieldset>',
  )
  assert.equal(engine.match(':valid', document.getElementById('empty')), true)
  assert.equal(
    engine.match(':valid', document.getElementById('disabled')),
    true,
  )
  assert.equal(
    engine.match(':valid', document.getElementById('invalid')),
    false,
  )
})

test('built-in and upgraded custom elements are defined', t => {
  const { window, document, engine } = fixture(
    t,
    '<div id="built"></div><svg id="svg"><font-face id="font"></font-face></svg><x-example id="custom"></x-example>',
  )
  assert.equal(engine.match(':defined', document.getElementById('built')), true)
  assert.equal(engine.match(':defined', document.getElementById('svg')), true)
  assert.equal(engine.match(':defined', document.getElementById('font')), true)
  assert.equal(
    engine.match(':defined', document.getElementById('custom')),
    false,
  )
  window.customElements.define('x-example', class extends window.HTMLElement {})
  assert.equal(
    engine.match(':defined', document.getElementById('custom')),
    true,
  )
})

test('link states reject similarly named elements', t => {
  const { engine } = fixture(
    t,
    '<a id="link" href="/"></a><area id="area" href="/"><abbr id="abbr" href="/"></abbr>',
  )
  for (const selector of [':link', ':any-link']) {
    assert.deepEqual(
      engine.select(selector).map(node => node.id),
      ['link', 'area'],
    )
  }
})

test('autofill requires host state instead of matching every element', t => {
  const { engine } = fixture(t, '<input><div></div>')
  assert.deepEqual(engine.select(':autofill'), [])
  assert.deepEqual(engine.select(':-webkit-autofill'), [])
})

test('stopped selection callbacks return only the visited prefix', t => {
  const { document, engine } = fixture(
    t,
    '<p id="a"></p><p id="b"></p><p id="c"></p>',
  )
  const stop = () => false
  for (let pass = 0; pass < 2; pass += 1) {
    assert.deepEqual(engine.select('p', document, stop), [
      document.getElementById('a'),
    ])
  }
})

test('SVG camelCase attributes retain exact-value matching from issue 306', t => {
  const { document, engine } = fixture(
    t,
    '<svg id="svg" viewBox="0 0 10 10" preserveAspectRatio="xMidYMid" class="logo"></svg>',
  )
  const svg = document.getElementById('svg')
  for (const selector of [
    'svg[viewBox]',
    'svg[viewBox="0 0 10 10"]',
    'svg[viewBox="0 0 10 10" i]',
    'svg[preserveAspectRatio="xMidYMid"]',
    'svg[class="logo"]',
  ]) {
    assert.deepEqual(engine.select(selector), [svg], selector)
    assert.equal(engine.match(selector, svg), true, selector)
  }
})

test('uninstall restores native collection methods', t => {
  const dom = new JSDOM('<main><p></p><p></p></main>', {
    runScripts: 'outside-only',
  })
  t.after(() => dom.window.close())
  const { window } = dom
  const document = window.document
  const main = document.querySelector('main')
  const original = window.Element.prototype.querySelectorAll
  window.eval(readFileSync(source, 'utf8'))
  for (let pass = 0; pass < 2; pass += 1) {
    window.NW.Dom.install()
    assert.equal(main.querySelectorAll('p').length, 2)
    window.NW.Dom.uninstall()
    assert.equal(window.Element.prototype.querySelectorAll, original)
    assert.ok(main.querySelectorAll('p') instanceof window.NodeList)
  }
})

test('issue 215: direct jsdom state matches stay bounded without install()', () => {
  const result = spawnSync(
    process.execPath,
    [
      '-e',
      `
    const assert = require('node:assert/strict')
    const { createRequire } = require('node:module')
    const source = process.argv[1]
    const jsdomRequire = createRequire(require.resolve('jsdom'))
    const path = jsdomRequire.resolve('nwsapi')
    jsdomRequire(path)
    const factory = require(source)
    let creations = 0
    require.cache[path].exports = function(...args) {
      creations++
      return factory(...args)
    }
    const { JSDOM } = require('jsdom')
    for (const selector of [
      ':modal', ':fullscreen', ':open', ':closed',
      ':picture-in-picture', ':popover-open', ':autofill'
    ]) {
      const { window } = new JSDOM('<div id="a"></div><div id="b" popover></div>')
      try {
        const before = creations
        const node = window.document.getElementById(selector === ':popover-open' ? 'b' : 'a')
        const original = window.Element.prototype.matches
        let calls = 0
        window.Element.prototype.matches = function(value) {
          if (++calls > 16) {
            throw new Error('Recursive host matcher')
          }
          return original.call(this, value)
        }
        for (let pass = 0; pass < 10; pass++) {
          calls = 0
          assert.equal(node.matches(selector), false, selector)
          assert.ok(calls >= 1 && calls <= 3, selector + ': ' + calls + ' calls')
        }
        assert.equal(creations - before, 1, 'jsdom must use the checkout engine')
      } finally {
        window.close()
      }
    }
  `,
      source,
    ],
    { cwd: root, encoding: 'utf8', timeout: 3000 },
  )
  assert.ifError(result.error)
  assert.equal(result.status, 0, result.stderr)
})

test('captured malformed selector is rejected within a process deadline', () => {
  const selector = readFileSync(
    new URL('fixture/parser-stall.txt', import.meta.url),
    'utf8',
  )
  const result = spawnSync(
    process.execPath,
    [
      '-e',
      `
    const assert = require('node:assert/strict')
    const { readFileSync } = require('node:fs')
    const { JSDOM } = require('jsdom')
    const factory = require(process.argv[1])
    const { window } = new JSDOM('<p></p>')
    const selector = readFileSync(0, 'utf8')
    assert.throws(() => factory(window).select(selector), { name: 'SyntaxError' })
    window.close()
  `,
      source,
    ],
    { cwd: root, input: selector, encoding: 'utf8', timeout: 3000 },
  )
  assert.ifError(result.error)
  assert.equal(result.status, 0, result.stderr)
})
