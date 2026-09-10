import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'
import { expect, test, vi } from 'vitest'
import factory from '../../../dist/nwsapi.js'

test('wildcard snapshots survive replacement collections while predicates stay live', t => {
  const { window } = new JSDOM(
    '<main>' + '<i data-hit></i>'.repeat(32) + '</main>',
  )
  t.onTestFinished(() => window.close())
  const doc = window.document
  const context = doc.querySelector('main')!
  const lookup = context.getElementsByTagName.bind(context)
  let reads = 0
  const spy = vi.spyOn(context, 'getElementsByTagName').mockImplementation(
    name =>
      new Proxy(lookup(name), {
        get(target, key) {
          if (typeof key === 'string' && /^\d+$/.test(key)) {
            ++reads
          }
          return Reflect.get(target, key, target)
        },
      }),
  )
  t.onTestFinished(() => spy.mockRestore())
  const engine = factory(window)
  expect(engine.select('[data-hit]', context)).toHaveLength(32)
  reads = 0
  context.setAttribute('data-unrelated', 'changed')
  context.firstElementChild!.removeAttribute('data-hit')
  expect(engine.select('[data-hit]', context)).toHaveLength(31)
  expect(reads).toBe(0)
  const extra = doc.createElement('i')
  extra.setAttribute('data-hit', '')
  context.prepend(extra)
  expect(engine.select('[data-hit]', context)).toHaveLength(32)
  expect(reads).toBeGreaterThan(0)
  const other = doc.createElement('aside')
  other.innerHTML = '<b data-hit></b>'.repeat(20)
  context.after(other)
  expect(engine.select('[data-hit]', other)).toHaveLength(20)
  context.remove()
  context.firstElementChild!.remove()
  expect(engine.select('[data-hit]', context)).toHaveLength(31)
})

test('candidate snapshots follow synchronous mutations and protect returned arrays', async t => {
  const { window } = new JSDOM(
    '<main>' + '<i class="item"></i>'.repeat(100) + '</main><aside></aside>',
  )
  t.onTestFinished(() => window.close())
  const doc = window.document
  const engine = factory(window)
  const main = doc.querySelector('main')!
  const aside = doc.querySelector('aside')!
  const check = () => {
    for (const context of [doc, main, aside] as const) {
      for (const selector of [
        'i',
        '.item',
        'i:nth-child(2n)',
        'i:nth-last-child(3)',
        'main > i',
      ] as const) {
        // A fresh tree keeps the reference engine's own positional caches out
        // of the mutation oracle. Compare stable outerHTML in tree order.
        const reference = context.cloneNode(true) as Document | Element
        expect(
          Array.from(engine.select(selector, context)).map(e => e.outerHTML),
          selector,
        ).toEqual(
          Array.from(reference.querySelectorAll(selector), e => e.outerHTML),
        )
      }
    }
  }
  check()
  check()
  const selected = engine.select('i', doc)
  const classes = engine.byClass('item', main)
  assert.ok(Array.isArray(selected), 'default select results are arrays')
  assert.ok(Array.isArray(classes), 'default class results are arrays')
  selected.length = 0
  classes.reverse()
  check()
  main.firstElementChild!.className = 'other'
  main.prepend(doc.createElement('b'))
  aside.append(main.lastElementChild!)
  check()
  main.innerHTML = '<i class="item">new</i>'.repeat(80)
  check()
  main.remove()
  check()
  doc.body.append(main)
  check()
  await Promise.resolve()
  check()
  let calls = 0
  engine.select('i', main, element => {
    if (++calls === 1) {
      element.remove()
      expect(engine.select('i', main)).toHaveLength(79)
    }
  })
  expect(calls).toBe(80)
  check()
})

test('candidate snapshots follow adoption and SVG class changes', t => {
  const one = new JSDOM(
    '<main>' + '<i class="item"></i>'.repeat(80) + '</main>',
  )
  const two = new JSDOM('<body></body>')
  t.onTestFinished(() => {
    one.window.close()
    two.window.close()
  })
  const engine = factory(one.window)
  const main = one.window.document.querySelector('main')!
  expect(engine.select('i', main)).toHaveLength(80)
  two.window.document.body.append(main)
  main.firstElementChild!.remove()
  expect(engine.select('i', main)).toHaveLength(79)
  const svg = two.window.document.createElementNS(
    'http://www.w3.org/2000/svg',
    'svg',
  )
  for (let i = 0; i < 80; ++i) {
    const node = two.window.document.createElementNS(svg.namespaceURI, 'g')
    node.setAttribute('class', 'item')
    svg.append(node)
  }
  two.window.document.body.append(svg)
  expect(engine.select('.item', svg)).toHaveLength(80)
  svg.firstElementChild!.setAttribute('class', 'changed')
  expect(engine.select('.item', svg)).toHaveLength(79)
})

test('detached snapshots follow adoption from quirks HTML into XML', t => {
  const html = new JSDOM('')
  const xml = new JSDOM('<root/>', { contentType: 'application/xml' })
  t.onTestFinished(() => {
    html.window.close()
    xml.window.close()
  })
  const engine = factory(html.window)
  const context = html.window.document.createElement('main')
  context.innerHTML = '<i class="ITEM"></i>'.repeat(40)
  expect(engine.select('.item', context)).toHaveLength(40)
  xml.window.document.documentElement.append(context)
  expect(engine.select('.item', context)).toEqual(
    Array.from(context.getElementsByClassName('item')),
  )
  context.firstElementChild!.setAttribute('class', 'item')
  expect(engine.select('.item', context)).toHaveLength(1)
})

test('default input editability follows type, readonly, and namespace changes', t => {
  const { window } = new JSDOM('<input>')
  t.onTestFinished(() => window.close())
  const engine = factory(window)
  const input = window.document.querySelector('input')!
  for (const type of [
    null,
    'checkbox',
    'text',
    'unknown',
    '',
    'HIDDEN',
  ] as const) {
    if (type === null) {
      input.removeAttribute('type')
    } else {
      input.setAttribute('type', type)
    }
    for (const readOnly of [false, true] as const) {
      input.readOnly = readOnly
      const expected = !readOnly && !['checkbox', 'hidden'].includes(input.type)
      expect(engine.match(':read-write', input)).toBe(expected)
      expect(engine.match(':read-only', input)).toBe(!expected)
    }
  }
  const foreign = window.document.createElementNS('urn:foreign', 'input')
  expect(engine.match(':read-write', foreign)).toBe(false)
})
