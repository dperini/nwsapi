import { expect, test } from 'vitest'
import { JSDOM } from 'jsdom'
import factory from '../../../src/nwsapi.js'

test('built-in and foreign-namespace elements are defined', () => {
  const { window } = new JSDOM(
    '<div id="ordinary"></div><svg><font-face></font-face></svg><math><mi></mi></math><x-pending></x-pending>',
  )
  try {
    const engine = factory(window)
    const pending = window.document.querySelector('x-pending')!
    for (const element of window.document.querySelectorAll('*')) {
      expect(engine.match(':defined', element), element.localName).toBe(
        element !== pending,
      )
    }
    expect(engine.select(':not(:defined)', window.document)).toEqual([pending])
  } finally {
    window.close()
  }
})

test('cached queries observe autonomous custom element upgrades', () => {
  const { window } = new JSDOM('<x-example></x-example>')
  try {
    const engine = factory(window)
    const element = window.document.querySelector('x-example')!
    expect(engine.match(':defined', element)).toBe(false)
    expect(engine.select('x-example:defined', window.document)).toEqual([])
    window.customElements.define(
      'x-example',
      class extends window.HTMLElement {},
    )
    expect(engine.match(':defined', element)).toBe(true)
    expect(engine.select('x-example:defined', window.document)).toEqual([
      element,
    ])
  } finally {
    window.close()
  }
})

test('uses native defined state when an is attribute changes', () => {
  const { window } = new JSDOM('<button></button>')
  try {
    const engine = factory(window)
    const button = window.document.querySelector('button')!
    Object.defineProperty(button, 'matches', {
      value: (selector: string) => selector === ':defined',
    })
    expect(engine.match(':defined', button)).toBe(true)
    button.setAttribute('is', 'x-not-registered')
    expect(engine.match(':defined', button)).toBe(true)
  } finally {
    window.close()
  }
})

test('customized built-ins become defined after upgrade', () => {
  const { window } = new JSDOM('<button is="x-button"></button>')
  try {
    const engine = factory(window)
    const button = window.document.querySelector('button')!
    expect(engine.match(':defined', button)).toBe(false)
    window.customElements.define(
      'x-button',
      class extends window.HTMLButtonElement {},
      { extends: 'button' },
    )
    expect(engine.match(':defined', button)).toBe(true)
  } finally {
    window.close()
  }
})
