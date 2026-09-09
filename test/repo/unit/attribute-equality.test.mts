import assert from 'node:assert/strict'
import { test } from 'vitest'
import { JSDOM } from 'jsdom'
import factory from '../../../dist/nwsapi.js'
import { markup, cases } from '../fixtures/attribute-equality.mts'

test('exact comparisons preserve attribute case rules', () => {
  const { window } = new JSDOM(markup)
  try {
    const nw = factory(window)
    assert.match(
      nw.compile('[data-k="TYPE"]', false)!.toString(),
      /getAttribute\("data-k"\)=="TYPE"/,
    )
    assert.match(nw.compile('[data-k="type" i]', false)!.toString(), /\.test\(/)
    assert.match(nw.compile('[type="CHECKBOX"]', false)!.toString(), /\.test\(/)
    for (const [selector, expected] of cases) {
      assert.deepEqual(
        Array.from(nw.select(selector)).map(e => e.id),
        expected,
        selector,
      )
      assert.deepEqual(
        Array.from(nw.select(selector)).map(e => e.id),
        expected,
        selector + ' cached',
      )
    }
    for (const [value, selector] of [
      ['é', '[data-k="\\e9"]'],
      ['😀', '[data-k="\\1f600"]'],
      ['a"b', "[data-k='a\"b']"],
      ['a"b', '[data-k="a\\"b"]'],
      ['a\\b', '[data-k="a\\\\b"]'],
      ['a.b', '[data-k="a\\.b"]'],
    ] as const) {
      window.document.getElementById('d')!.setAttribute('data-k', value!)
      assert.deepEqual(
        Array.from(nw.select(selector!)).map(e => e.id),
        ['d'],
        selector,
      )
    }
    nw.registerOperator('!=', { p1: '^', p2: '$', p3: 'false' })
    assert.equal(
      nw.match('[data-k!="a.b"]', window.document.getElementById('d')!),
      false,
    )
    assert.equal(
      nw.match('[data-k!="other"]', window.document.getElementById('d')!),
      true,
    )
  } finally {
    window.close()
  }
})

test('XML attributes remain case-sensitive', () => {
  const { window } = new JSDOM(
    '<root><input id="i" type="checkbox"/><g id="s" data-k="TYPE"/></root>',
    { contentType: 'application/xml' },
  )
  try {
    const nw = factory(window)
    assert.deepEqual(nw.select('[type="CHECKBOX"]'), [])
    assert.deepEqual(
      Array.from(nw.select('[type="checkbox"]')).map(e => e.id),
      ['i'],
    )
    assert.deepEqual(nw.select('[data-k="type"]'), [])
    assert.deepEqual(
      Array.from(nw.select('[data-k="type" i]')).map(e => e.id),
      ['s'],
    )
  } finally {
    window.close()
  }
})

test('cached attribute case rules follow HTML and XML document changes', t => {
  const html = new JSDOM('<input type="checkbox">')
  const xml = new JSDOM('<root><input type="checkbox"/></root>', {
    contentType: 'application/xml',
  })
  t.onTestFinished(() => {
    html.window.close()
    xml.window.close()
  })
  const nw = factory(html.window)
  for (const document of [
    html.window.document,
    xml.window.document,
    html.window.document,
  ] as const) {
    assert.equal(
      nw.select('[type="CHECKBOX"]', document).length,
      document.contentType === 'text/html' ? 1 : 0,
    )
  }
})
