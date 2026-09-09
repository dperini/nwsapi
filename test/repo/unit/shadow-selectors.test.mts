import { JSDOM } from 'jsdom'
import { expect, test } from 'vitest'
import factory from '../../../dist/nwsapi.js'
import { createLegacyEngine } from '../common/legacy.mts'

for (const [mode, create] of [
  ['modern', factory],
  ['legacy', createLegacyEngine],
] as const) {
  test(`${mode} host filters preserve quoted attributes and escaped identifiers`, t => {
    const { window } = new JSDOM(
      '<section class="context"><main id="host" class="ho:st"></main></section>',
    )
    t.onTestFinished(() => window.close())
    const doc = window.document
    const host = doc.querySelector('main')!
    host.setAttribute('data-label', 'quoted "value"')
    const root = host.attachShadow({ mode: 'open' })
    root.innerHTML = '<slot></slot>'
    const slot = root.firstElementChild!
    const engine = create(window)

    for (const selector of [
      ':host > slot',
      ':host-context(:where(section.context)) > slot',
      ':host-context(.context) > slot',
      ':host(:is(main > div, #host)) > slot',
      ':host(:not([data-label="wrong"])) > slot',
      ':host(:where([data-label="wrong"], .ho\\:st)) > slot',
      ':host(.ho\\:st) > slot',
      ':host([data-label="quoted \\"value\\""]) > slot',
      ':host(#host) > slot',
    ]) {
      expect(engine.select(selector, root), selector).toEqual([slot])
      expect(engine.first(selector, root), selector).toBe(slot)
    }
    for (const selector of [
      ':host-context(.missing) > slot',
      ':host(:is(main > div)) > slot',
      ':host(.missing) > slot',
    ]) {
      expect(engine.select(selector, root), selector).toEqual([])
    }
    expect(() =>
      engine.select(':host(:not(main > div, #host)) > slot', root),
    ).toThrow()
    expect(engine.select(':host > slot', doc)).toEqual([])
    host.id = 'changed'
    expect(engine.select(':host(#host) > slot', root)).toEqual([])
    expect(engine.select(':host(#changed) > slot', root)).toEqual([slot])
    Object.defineProperty(root, 'getRootNode', { value: undefined })
    expect(engine.select(':host(#changed) > slot', root)).toEqual([slot])
  })

  test(`${mode} slotted filters inspect live assignments and missing DOM APIs`, t => {
    const { window } = new JSDOM(
      '<main>text<div></div><span class="assigned"></span></main>',
    )
    t.onTestFinished(() => window.close())
    const doc = window.document
    const host = doc.querySelector('main')!
    const assigned = host.querySelector('span')!
    const root = host.attachShadow({ mode: 'open' })
    root.innerHTML = '<slot></slot>'
    const slot = root.firstElementChild!
    const engine = create(window)

    expect(engine.match(':has-slotted', slot)).toBe(true)
    expect(engine.match(':has-slotted(.assigned)', slot)).toBe(true)
    expect(engine.match(':has-slotted(.missing)', slot)).toBe(false)
    expect(engine.match(':has-slotted', host)).toBe(false)
    expect(
      engine.match(
        ':has-slotted',
        doc.createElementNS('http://www.w3.org/2000/svg', 'slot'),
      ),
    ).toBe(false)
    assigned.remove()
    expect(engine.match(':has-slotted(.assigned)', slot)).toBe(false)
    host.append(assigned)
    expect(engine.match(':has-slotted(.assigned)', slot)).toBe(true)
    host.replaceChildren()
    expect(engine.match(':has-slotted', slot)).toBe(false)
    Object.defineProperty(slot, 'assignedNodes', { value: undefined })
    expect(engine.match(':has-slotted', slot)).toBe(false)
    expect(() => engine.match(':has-slotted()', slot)).toThrow()
    expect(() => engine.match(':has-slotted(main > span)', slot)).toThrow()
  })
}
