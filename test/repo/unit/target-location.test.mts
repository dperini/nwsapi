import { expect, test } from 'vitest'
import { JSDOM } from 'jsdom'
import factory from '../../../dist/nwsapi.js'

test(':target handles documents without a browsing context', t => {
  const { window } = new JSDOM('<div id="here"></div>', {
    url: 'https://example.test/#here',
  })
  t.onTestFinished(() => window.close())
  const engine = factory(window)
  const xml = new window.DOMParser().parseFromString(
    '<root><item id="here"/></root>',
    'application/xml',
  )
  const detached = window.document.implementation.createHTMLDocument('')
  detached.body.innerHTML = '<div id="here"></div>'
  const live = window.document.getElementById('here')!

  for (let repeat = 0; repeat < 2; repeat++) {
    for (const document of [xml, detached]) {
      const element = document.getElementById('here')!
      expect(document.location).toBeNull()
      expect(engine.match(':target', element)).toBe(false)
      expect(engine.select(':target', document)).toEqual([])
      expect(engine.first(':target', document)).toBeNull()
      expect(engine.match(':target', live)).toBe(true)
    }
  }
  window.location.hash = '#elsewhere'
  expect(engine.match(':target', live)).toBe(false)
  window.location.hash = '#here'
  expect(engine.select(':target', window.document)).toEqual([live])
})
