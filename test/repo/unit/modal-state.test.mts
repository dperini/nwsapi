import { JSDOM } from 'jsdom'
import { expect, test } from 'vitest'
import createNwsapi from '../../../dist/nwsapi.js'
import registerLegacy from '../../../dist/modules/nwsapi-legacy.js'

for (const legacy of [false, true]) {
  test(`modal state ignores ARIA and expando properties (legacy=${legacy})`, t => {
    const { window } = new JSDOM(
      '<dialog open aria-modal="true"></dialog><details open aria-modal="true"></details><div role="dialog" aria-modal="true"></div>',
    )
    t.onTestFinished(() => window.close())
    const engine = registerLegacy(createNwsapi(window))
    engine.configure({ LEGACY: legacy })
    const nodes = Array.from(window.document.body.children)
    for (const node of nodes) {
      Object.defineProperty(node, 'modal', { value: true })
      expect(node.getAttribute('aria-modal')).toBe('true')
      expect(engine.match(':modal', node)).toBe(false)
    }
    expect(engine.select('[aria-modal="true"]', window.document)).toEqual(nodes)
    expect(engine.select(':open', window.document)).toEqual(nodes.slice(0, 2))
    window.Element.prototype.matches = (() => {
      throw new Error('Native matching is unavailable')
    }) as unknown as Element['matches']
    Object.defineProperty(window.document, 'fullscreenElement', {
      configurable: true,
      value: nodes[2],
    })
    expect(engine.select(':modal', window.document)).toEqual([nodes[2]])
    Object.defineProperty(window.document, 'fullscreenElement', { value: null })
    expect(engine.select(':modal', window.document)).toEqual([])
  })
}

test('observable states remain available when native matching is unavailable', t => {
  const { window } = new JSDOM('<video></video>')
  t.onTestFinished(() => window.close())
  const node = window.document.body.firstElementChild!
  let calls = 0
  window.Element.prototype.matches = function () {
    calls++
    throw new Error('Native matching is unavailable')
  } as unknown as Element['matches']
  const engine = createNwsapi(window)
  for (const property of [
    'fullscreenElement',
    'webkitFullscreenElement',
    'mozFullScreenElement',
    'msFullscreenElement',
  ]) {
    Object.defineProperty(window.document, property, {
      configurable: true,
      value: node,
    })
    expect(engine.match(':fullscreen', node)).toBe(true)
    expect(engine.match(':modal', node)).toBe(true)
    expect(calls).toBeGreaterThan(0)
    Reflect.deleteProperty(window.document, property)
  }
  calls = 0
  Object.defineProperty(window.document, 'pictureInPictureElement', {
    configurable: true,
    value: node,
  })
  expect(engine.match(':picture-in-picture', node)).toBe(true)
  expect(calls).toBe(0)
  Reflect.deleteProperty(window.document, 'pictureInPictureElement')
  Object.defineProperty(node, 'webkitPresentationMode', {
    configurable: true,
    value: 'picture-in-picture',
  })
  expect(engine.match(':picture-in-picture', node)).toBe(true)
  expect(calls).toBe(0)
  Reflect.deleteProperty(node, 'webkitPresentationMode')
  expect(engine.match(':modal', node)).toBe(false)
  expect(calls).toBeGreaterThan(0)
})

test('known fullscreen absence rejects impossible modal states before native matching', t => {
  const { window } = new JSDOM(
    '<dialog aria-modal="true"></dialog><details open aria-modal="true"></details><div aria-modal="true"></div>',
  )
  t.onTestFinished(() => window.close())
  Object.defineProperty(window.document, 'fullscreenElement', {
    configurable: true,
    value: null,
  })
  let calls = 0
  window.Element.prototype.matches = function (
    this: Element,
    selector: string,
  ) {
    calls++
    return this.localName === 'dialog' && selector === ':modal'
  } as unknown as Element['matches']
  const engine = createNwsapi(window)
  for (const node of Array.from(window.document.body.children).slice(1)) {
    expect(engine.match(':fullscreen', node)).toBe(false)
    expect(engine.match(':modal', node)).toBe(false)
  }
  expect(calls).toBe(0)
  const dialog = window.document.querySelector('dialog')!
  dialog.open = true
  expect(engine.match(':modal', dialog)).toBe(true)
  expect(calls).toBe(1)
  const another = window.document.createElement('div')
  Object.defineProperty(window.document, 'fullscreenElement', {
    value: another,
  })
  window.Element.prototype.matches = (() =>
    true) as unknown as Element['matches']
  expect(engine.match(':fullscreen', dialog)).toBe(true)
})
