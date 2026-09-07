import { JSDOM } from 'jsdom'
import { describe, expect, test } from 'vitest'
import factory from '../../../src/nwsapi.js'

describe(':hover tracking is installed on demand', () => {
  function buildCounting(html) {
    const dom = new JSDOM(html)
    const { window } = dom
    const seen = []
    const original = window.document.addEventListener.bind(window.document)
    window.document.addEventListener = function (type, ...rest) {
      seen.push(type)
      return original(type, ...rest)
    }
    const host = {
      document: window.document,
      DOMException: window.DOMException,
    }
    const NW = factory(host)
    return {
      window,
      document: window.document,
      NW,
      mouseListeners: () => seen.filter(t => t.startsWith('mouse')),
    }
  }

  test('no listeners until a :hover selector is compiled', () => {
    const { document, NW, mouseListeners } = buildCounting(
      '<!doctype html><body><p id=p>x</p></body>',
    )
    expect(mouseListeners()).toEqual([])

    NW.select('p', document)
    expect(
      mouseListeners(),
      'an ordinary selector must not install them',
    ).toEqual([])

    expect(NW.select('p:hover', document)).toEqual([])
    expect(mouseListeners()).toEqual(['mouseover', 'mouseout'])
    NW.match(':hover', document.body)
    NW.select('body:hover', document)
    expect(mouseListeners()).toEqual(['mouseover', 'mouseout'])
  })

  test(':hover still matches once tracking is installed', () => {
    const { window, document, NW } = buildCounting(
      '<!doctype html><body><p id=p>x</p></body>',
    )
    const target = document.getElementById('p')

    expect(NW.match(':hover', target)).toBe(false)
    target.dispatchEvent(new window.MouseEvent('mouseover', { bubbles: true }))
    expect(NW.match(':hover', target)).toBe(true)
    target.dispatchEvent(new window.MouseEvent('mouseout', { bubbles: true }))
    expect(NW.match(':hover', target)).toBe(false)
  })
})
