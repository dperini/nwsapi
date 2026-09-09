import { JSDOM } from 'jsdom'
import { expect, test } from 'vitest'
import factory from '../../../dist/nwsapi.js'
import { registerLegacy } from '../common/legacy.mts'

for (const legacy of [false, true]) {
  test(`foreign type candidates preserve local names, case, order, and mutations (legacy ${legacy})`, async t => {
    const { window } = new JSDOM('<main><p id="html" class="item"></p></main>')
    t.onTestFinished(() => window.close())
    const doc = window.document
    const main = doc.querySelector('main')!
    const engine = factory(window)
    if (legacy) {
      registerLegacy(engine).configure({ LEGACY: true })
    }
    const ids = (
      selector: string,
      context: Document | Element | DocumentFragment = doc,
    ) => Array.from(engine.select(selector, context), e => e.id)
    expect(ids('p')).toEqual(['html'])
    for (const [namespace, name, id] of [
      ['urn:foreign', 's:p', 'prefix'],
      ['urn:foreign', 's:P', 'upper-prefix'],
      ['urn:foreign', 'P', 'upper'],
      ['http://www.w3.org/1999/xhtml', 'h:p', 'html-prefix'],
    ]) {
      const element = doc.createElementNS(namespace!, name!)
      element.id = id!
      element.setAttribute('class', 'item')
      main.append(element)
    }
    for (const selector of [
      'p',
      'P',
      '*|p',
      '*|P',
      'p.item',
      ':is(p,span)',
      'main p',
      'main > p',
      'main.item > p',
    ]) {
      main.className = 'item'
      expect(ids(selector), selector).toEqual([
        'html',
        'prefix',
        'upper-prefix',
        'upper',
        'html-prefix',
      ])
      expect(engine.first(selector, doc)?.id, selector).toBe('html')
    }
    expect(ids('p:first-of-type')).toEqual(['html', 'prefix', 'upper-prefix'])
    expect(ids('p:nth-of-type(2)')).toEqual(['upper', 'html-prefix'])
    for (const element of main.children) {
      expect(engine.match('p', element)).toBe(true)
      expect(engine.match('P.item', element)).toBe(true)
    }
    main.firstElementChild!.remove()
    expect(engine.first('p', doc)?.id).toBe('prefix')
    expect(engine.first('P.item', doc)?.id).toBe('prefix')
    const fragment = doc.createDocumentFragment()
    fragment.append(main)
    expect(ids('p', fragment)).toEqual([
      'prefix',
      'upper-prefix',
      'upper',
      'html-prefix',
    ])
    await Promise.resolve()
    const extra = doc.createElementNS('urn:foreign', 's:p')
    extra.id = 'late'
    main.prepend(extra)
    await Promise.resolve()
    expect(engine.first('p', fragment)?.id).toBe('late')
    expect(engine.first('p', doc)).toBeNull()
    const xml = new window.DOMParser().parseFromString(
      '<root xmlns:s="urn:foreign"><s:p id="lower"/><s:P id="upper"/></root>',
      'text/xml',
    )
    expect(ids('p', xml)).toEqual(['lower'])
    expect(ids('P', xml)).toEqual(['upper'])
    expect(ids('p', fragment)[0]).toBe('late')
  })
}

test('foreign candidate classification refreshes after observer delivery and preserves NodeList output', async t => {
  const { window } = new JSDOM('<main><p></p></main>')
  t.onTestFinished(() => window.close())
  const engine = factory(window)
  const doc = window.document
  const main = doc.querySelector('main')!
  expect(engine.first('p', doc)).toBe(main.firstElementChild)
  const foreign = doc.createElementNS('urn:foreign', 's:p')
  foreign.id = 'foreign'
  main.prepend(foreign)
  await new Promise(resolve => setTimeout(resolve, 0))
  expect(engine.first('p', doc)).toBe(foreign)
  engine.configure({ NODE_LIST: true })
  const result = engine.byTag('p', main)
  expect(result).toBeInstanceOf(window.NodeList)
  expect(result[0]).toBe(foreign)
  expect(engine.select('p:nth-of-type(1)', main)[0]).toBe(foreign)
  foreign.remove()
  await new Promise(resolve => setTimeout(resolve, 0))
  expect(engine.first('p', doc)).toBe(main.firstElementChild)
  const uppercaseHtml = doc.createElementNS(
    'http://www.w3.org/1999/xhtml',
    'h:P',
  )
  main.prepend(uppercaseHtml)
  expect(engine.match('P', uppercaseHtml)).toBe(false)
  expect(engine.first('P', doc)).toBe(main.lastElementChild)
})

test('direct-child has predicates include foreign mixed-case local names', t => {
  const { window } = new JSDOM('<main></main>')
  t.onTestFinished(() => window.close())
  const main = window.document.querySelector('main')!
  main.append(window.document.createElementNS('urn:foreign', 's:P'))
  const engine = factory(window)
  expect(engine.first('main:has(> p)', window.document)).toBe(main)
  expect(engine.match(':has(> p)', main)).toBe(true)
})

test('minimal adapter hosts reuse the document window for foreign-type invalidation', t => {
  const { window } = new JSDOM(
    '<main>' +
      '<section class="row"><span></span></section>'.repeat(40) +
      '</main>',
  )
  t.onTestFinished(() => window.close())
  const doc = window.document
  const engine = factory({
    document: doc,
    DOMException: window.DOMException,
  } as unknown as Window)
  const descriptor = Object.getOwnPropertyDescriptor(
    window.Element.prototype,
    'namespaceURI',
  )!
  let reads = 0
  Object.defineProperty(window.Element.prototype, 'namespaceURI', {
    ...descriptor,
    get() {
      reads++
      return descriptor.get!.call(this)
    },
  })
  expect(engine.select('.row > span', doc).length).toBe(40)
  reads = 0
  expect(engine.select('.row > span', doc).length).toBe(40)
  expect(reads).toBeLessThan(10)
  const foreign = doc.createElementNS('urn:foreign', 'x:span')
  doc.querySelector('section')!.append(foreign)
  expect(engine.select('.row > span', doc).length).toBe(41)
  foreign.remove()
  expect(engine.select('.row > span', doc).length).toBe(40)
})
