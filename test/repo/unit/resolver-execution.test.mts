import assert from 'node:assert/strict'
import fs from 'node:fs'
import { test, type TestContext } from 'vitest'
import { JSDOM } from 'jsdom'
import factory from '../../../src/nwsapi.js'

function fixture(t: TestContext) {
  const { window } = new JSDOM(
    '<div id=d><p id=a class="a.b" data-x=1></p><p id=b></p><span id=c></span></div>',
  )
  t.onTestFinished(() => window.close())
  return {
    document: window.document,
    nw: factory(window),
  }
}

test('cold and cached plans return ordered results across mutations', t => {
  const { document, nw } = fixture(t)
  for (const selector of [
    'p',
    'p, span',
    '[data-x], span',
    '.a\\.b',
    'p.a\\.b',
    'div > p + span',
    'div p[data-x="1"]',
  ] as const) {
    for (let i = 0; i < 2; i++) {
      assert.deepEqual(
        Array.from(nw.select(selector, document)).map(e => e.id),
        Array.from(document.querySelectorAll(selector), (e: Element) => e.id),
        selector,
      )
    }
  }
  assert.equal(
    nw.compile('', true),
    null,
    'no-copy resolver is cached explicitly',
  )
  assert.equal(nw.compile('', true), null)
  document.getElementById('b')!.remove()
  assert.deepEqual(
    Array.from(nw.select('p', document)).map(e => e.id),
    ['a'],
  )
})

test('callbacks and matching retain their behavior', t => {
  const { document, nw } = fixture(t)
  const seen: string[] = []
  assert.deepEqual(
    Array.from(
      nw.select('p', document, e => {
        seen.push(e.id)
      }),
    ).map(e => e.id),
    ['a', 'b'],
  )
  assert.deepEqual(seen, ['a', 'b'])
  assert.equal(nw.first('p', document)!.id, 'a')
  for (let i = 0; i < 2; i++) {
    assert.equal(nw.match('p[data-x="1"]', document.getElementById('a')!), true)
    assert.equal(
      nw.match('p[data-x="1"]', document.getElementById('b')!),
      false,
    )
  }
})

test('matching can add, replace, and omit callbacks after the resolver is cached', t => {
  const { document, nw } = fixture(t)
  const target = document.getElementById('a')
  const seen: string[] = []
  for (const callback of [
    undefined,
    () => seen.push('first'),
    undefined,
    () => seen.push('second'),
  ] as const) {
    assert.equal(nw.match('p[data-x="1"]', target!, callback), true)
  }
  assert.deepEqual(seen, ['first', 'second'])
})

test('compiled array and item loops do not read past their candidates', t => {
  const { document, nw } = fixture(t)
  const target = document.getElementById('a')
  const array = new Proxy([target], {
    get(object, key) {
      assert.notEqual(key, '1', 'out-of-bounds read')
      return Reflect.get(object, key)
    },
  })
  assert.deepEqual(nw.compile('p', true)!(array, null, document, []), [target])
  const items = {
    length: 1,
    item(index: unknown) {
      assert.equal(index, 0)
      return target
    },
  }
  assert.deepEqual(nw.compile('p', null)!(items, null, document, []), [target])
})

test('item loops append all matches and callback compilation stays distinct', t => {
  const { document, nw } = fixture(t)
  const candidates = [
    document.getElementById('a'),
    document.getElementById('b'),
  ]
  const items = {
    length: candidates.length,
    item(index: number) {
      assert.ok(index < this.length)
      return candidates[index]
    },
  }
  assert.deepEqual(
    nw.compile('p', null)!(items, null, document, []),
    candidates,
  )
  assert.deepEqual(
    nw.compile('p', true)!(candidates, null, document, []),
    candidates,
  )
  assert.equal(nw.compile('', true), null)
  const seen: string[] = []
  assert.deepEqual(
    nw.compile('', true, true)!(
      candidates,
      e => {
        seen.push(e.id)
        return true
      },
      document,
      [],
    ),
    [candidates[0]],
  )
  assert.deepEqual(seen, ['a'])
  assert.equal(nw.compile('', true), null)
})

test('the tag rejects a candidate before an attribute read', t => {
  const { nw } = fixture(t)
  const target = {
    localName: 'span',
    getAttribute() {
      throw Error('unnecessary attribute read')
    },
  }
  assert.equal(
    nw.compile('p[data-x="1"]', false)!(target, null, null, false),
    false,
  )
})

test('a large working set does not corrupt the returning plan', t => {
  const { document, nw } = fixture(t)
  const hot = () => Array.from(nw.select('p.a\\.b', document)).map(e => e.id)
  assert.deepEqual(hot(), ['a'])
  for (let i = 0; i < 5000; i++) {
    nw.select('.unused-' + i, document)
  }
  assert.deepEqual(hot(), ['a'])
})

test('installed wrappers use the captured slice callable', t => {
  const { window } = new JSDOM('<div id=d><p id=p></p></div>', {
    runScripts: 'outside-only',
  })
  t.onTestFinished(() => window.close())
  window.eval(
    fs.readFileSync(new URL('../../../src/nwsapi.js', import.meta.url), 'utf8'),
  )
  window.NW.Dom.install()
  const { document } = window
  const p = document.getElementById('p')
  assert.equal(document.querySelector('p'), p)
  assert.deepEqual(Array.from(document.querySelectorAll('p')), [p])
  assert.equal(p!.matches('p'), true)
  assert.equal(p!.closest('div')!.id, 'd')
  assert.equal(document.body.querySelector('p'), p)
  assert.deepEqual(Array.from(document.body.querySelectorAll('p')), [p])
})
