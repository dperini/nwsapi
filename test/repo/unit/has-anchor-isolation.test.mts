import { JSDOM } from 'jsdom'
import { expect, test } from 'vitest'
import factory from '../../../dist/nwsapi.js'

test('relative anchors are not public selector syntax, including cached queries', t => {
  const { window } = new JSDOM(
    '<div id="parent"><p data-value=":-nwsapi-anchor"></p></div><div></div>',
  )
  t.onTestFinished(() => window.close())
  const nw = factory(window)
  const parent = window.document.getElementById('parent')
  const quoted = 'div:has([data-value=":-nwsapi-anchor"])'
  for (let repeat = 0; repeat < 3; repeat++) {
    expect(nw.select('div:has(p)', window.document)).toEqual([parent])
    expect(nw.select(quoted, window.document)).toEqual([parent])
    expect(nw.match(quoted, parent!)).toBe(true)
    for (const selector of [
      ':-nwsapi-anchor',
      ':-nwsapi-anchor p',
      'div:has(:-nwsapi-anchor)',
      'div:not(:-nwsapi-anchor)',
      'div:has(:not(:-nwsapi-anchor))',
      'div:not(:not(:-nwsapi-anchor))',
    ] as const) {
      expect(() => nw.select(selector, window.document), selector).toThrow(
        expect.objectContaining({ name: 'SyntaxError' }),
      )
      expect(() => nw.match(selector, parent!), selector).toThrow(
        expect.objectContaining({ name: 'SyntaxError' }),
      )
    }
    // Forgiving lists discard the invalid item, not their valid alternatives.
    expect(nw.select('div:is(:-nwsapi-anchor, #parent)')).toEqual([parent])
    expect(nw.select('div:where(:-nwsapi-anchor, #parent)')).toEqual([parent])
  }
})
