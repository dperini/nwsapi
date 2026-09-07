import { test, expect } from 'vitest'
import { JSDOM } from 'jsdom'
import { readFileSync } from 'node:fs'

test('uninstall restores querySelectorAll and its collection contract', t => {
  /* oxlint-disable typescript/unbound-method -- Compare method identities without calling detached methods. */
  const { window } = new JSDOM('<main><p></p><p></p></main>', {
    runScripts: 'outside-only',
  })
  t.onTestFinished(() => window.close())
  window.eval(
    readFileSync(new URL('../../../src/nwsapi.js', import.meta.url), 'utf8'),
  )
  const engine = window.NW.Dom
  const main = window.document.querySelector('main')
  const original = window.Element.prototype.querySelectorAll
  for (let repeat = 0; repeat < 2; repeat++) {
    engine.install()
    expect(main.querySelectorAll('p').length).toBe(2)
    engine.uninstall()
    expect(window.Element.prototype.querySelectorAll).toBe(original)
    expect(window.HTMLElement.prototype.querySelectorAll).toBe(original)
    const result = main.querySelectorAll('p')
    expect(result).toBeInstanceOf(window.NodeList)
    expect(Array.from(result)).toEqual(Array.from(main.children))
    expect(main.querySelectorAll('.missing').length).toBe(0)
    expect(main.querySelector('p')).toBe(main.firstElementChild)
  }
})
