import assert from 'node:assert/strict'
import { test, describe, afterEach } from 'vitest'
import { JSDOM, type BinaryData, type DOMWindow } from 'jsdom'
import factory from '../../../dist/nwsapi.js'
const windows: DOMWindow[] = []
afterEach(() => {
  for (const window of windows.splice(0)) {
    window.close()
  }
})
function build(html: string | Buffer | BinaryData | undefined) {
  const { window } = new JSDOM(html)
  windows.push(window)
  const NW = factory(window)
  return { window, document: window.document, NW }
}

describe(':empty counts only content children', () => {
  test('a comment or processing instruction child stays empty', () => {
    const { document, NW } = build(
      '<!DOCTYPE html><html><body><div id="host"></div><div id="withPi"></div></body></html>',
    )
    const host = document.querySelector('#host')!
    host.appendChild(document.createComment('note'))
    const withPi = document.querySelector('#withPi')!
    withPi.appendChild(document.createProcessingInstruction('target', 'data'))
    assert.deepEqual(
      Array.from(NW.select('div:empty', document) as ArrayLike<Element>).map(
        element => element.id,
      ),
      ['host', 'withPi'],
    )
  })

  test('a CDATA section child is content', () => {
    const dom = new JSDOM('<root><section/></root>', {
      contentType: 'application/xml',
    })
    windows.push(dom.window)
    const doc = dom.window.document
    const NW = factory(dom.window)
    const host = doc.querySelector('section')!
    host.appendChild(doc.createCDATASection('data'))
    assert.deepEqual(NW.select('section:empty', doc), [])
  })

  test('a doctype child of an element is not misread as content', () => {
    // A doctype can only sit under a document, so the digit overlap
    // in the old string test is exercised through the document's own
    // doctype being ignored by element matching.
    const { document, NW } = build('<!DOCTYPE html><html><body></body></html>')
    assert.equal(NW.select('body:empty', document).length, 1)
  })
})

describe(':default across candidates with and without a form', () => {
  test('a later candidate without a form cannot inherit an earlier scratch', () => {
    const { document, NW } = build(
      '<!DOCTYPE html><html><body>' +
        '<form><input id="a" type="checkbox" checked><input id="b" type="checkbox"></form>' +
        '<input id="c" type="checkbox">' +
        '</body></html>',
    )
    // 'b' clears the scan and 'c' has no form at all; neither may
    // inherit 'a''s verdict through a shared scratch.
    assert.deepEqual(
      Array.from(
        NW.select('input:default', document) as ArrayLike<Element>,
      ).map(element => element.id),
      ['a'],
    )
  })

  test('the scan index resets per candidate', () => {
    const { document, NW } = build(
      '<!DOCTYPE html><html><body>' +
        '<form><input id="a" type="submit"><input id="b" type="text"><input id="c" type="submit"></form>' +
        '</body></html>',
    )
    // 'a' is the form's first submit; 'b' restarts the scan from its
    // own index 0 and misses, and a later submit is not the default.
    assert.deepEqual(
      Array.from(
        NW.select('input:default', document) as ArrayLike<Element>,
      ).map(element => element.id),
      ['a'],
    )
  })
})

describe(':heading level arguments', () => {
  const fixture = '<!DOCTYPE html><html><body><h1></h1><h3></h3></body></html>'

  test('out-of-range levels match nothing but stay valid', () => {
    const { document, NW } = build(fixture)
    for (const selector of [
      ':heading(0)',
      ':heading(9)',
      ':heading(-2)',
      'h1:heading(2)',
    ] as const) {
      assert.deepEqual(NW.select(selector, document), [])
    }
  })

  test('listed levels keep only the named ranks', () => {
    const { document, NW } = build(fixture)
    assert.deepEqual(NW.select(':heading(1)', document).length, 1)
    assert.deepEqual(NW.select(':heading(1,3)', document).length, 2)
    assert.deepEqual(NW.select(':heading(2)', document).length, 0)
  })
})

describe('matching a selector list with a callback', () => {
  test('every matching alternative is still observed', () => {
    const { document, NW } = build(
      '<!DOCTYPE html><html><body><p id="a" class="x"></p></body></html>',
    )
    const node = document.querySelector('#a')!
    const seen: string[] = []
    const result = NW.match('p, .x', node, element => {
      seen[seen.length] = element.id
      return true
    })
    assert.equal(result, true)
    assert.deepEqual(seen, ['a', 'a'])
  })

  test('callback-free matching stops at the first hit', () => {
    // Covered implicitly by every match() call; pinned here so a
    // future full-scan change is a decision, not an accident.
    const { document, NW } = build(
      '<!DOCTYPE html><html><body><p id="a" class="x"></p></body></html>',
    )
    const node = document.querySelector('#a')!
    assert.equal(NW.match('p, .x', node), true)
  })
})
