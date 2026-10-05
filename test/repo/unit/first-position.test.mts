import { JSDOM } from 'jsdom'
import { expect, test } from 'vitest'
import factory from '../../../dist/nwsapi.js'

test('first shares forward positions through a late or missing match', t => {
  const { window } = new JSDOM(
    '<!doctype html><main>' + '<i class="item"></i>'.repeat(512) + '</main>',
  )
  t.onTestFinished(() => window.close())
  const document = window.document
  const engine = factory(window)
  const last = document.getElementsByTagName('i')[511]!
  const descriptor = Object.getOwnPropertyDescriptor(
    window.Element.prototype,
    'previousElementSibling',
  )!
  let reads = 0
  Object.defineProperty(window.Element.prototype, 'previousElementSibling', {
    ...descriptor,
    get() {
      ++reads
      return descriptor.get!.call(this) as Element | null
    },
  })
  for (const selector of [
    'i[data-hit]:nth-child(2n)',
    '.item[data-hit]:nth-child(2n)',
  ]) {
    reads = 0
    expect(engine.first(selector)).toBeNull()
    expect(reads).toBeLessThan(1100)
    last.setAttribute('data-hit', '')
    reads = 0
    expect(engine.first(selector)).toBe(last)
    expect(reads).toBeLessThan(1100)
    last.removeAttribute('data-hit')
  }
})

test('first position state is local to groups, parents and nested calls', t => {
  const { window } = new JSDOM(
    '<!doctype html><main>' +
      '<section><i></i><b></b><i class="hit"></i><i></i></section>'.repeat(8) +
      '</main>',
  )
  t.onTestFinished(() => window.close())
  const document = window.document
  const engine = factory(window)
  const selectors = [
    'i:nth-child(2n)',
    'i:nth-child(3n)',
    'i:nth-child(2n):nth-child(3n)',
    'i:nth-last-child(2n), i:nth-child(2n)',
    'i:nth-of-type(2n), i:nth-child(2n)',
    'i:nth-child(2n of i), i:nth-child(3n)',
    'section:nth-child(2n) > i:nth-child(2n)',
    'i:not(:nth-child(2n)):nth-child(3n)',
  ]
  for (const selector of selectors) {
    expect(
      engine.first(selector) === document.querySelector(selector),
      selector,
    ).toBe(true)
  }
  const expected = document.querySelector('i:nth-child(2n)')!
  expect(
    engine.first('i:nth-child(2n)', document, element => {
      expect(element).toBe(expected)
      element.remove()
      expect(engine.first('i:nth-child(2n)')).toBe(
        document.querySelector('i:nth-child(2n)'),
      )
    }),
  ).toBe(expected)
  const fragment = document.createDocumentFragment()
  fragment.append(document.querySelector('main')!)
  const remaining = Array.from(fragment.querySelectorAll('i'))
  const expectedIndexes = [4, 1, -1, 2, 1, 1, 4, 1]
  for (let index = 0; index < selectors.length; ++index) {
    const selector = selectors[index]!
    expect(engine.first(selector, fragment), selector).toBe(
      remaining[expectedIndexes[index]!] || null,
    )
  }
})

test('first positional progress survives nested queries from a live predicate', t => {
  const { window } = new JSDOM(
    '<!doctype html><main><i></i><i></i><i></i><i data-hit></i></main>',
  )
  t.onTestFinished(() => window.close())
  const engine = factory(window)
  const nodes = Array.from(window.document.getElementsByTagName('i'))
  const original = nodes[1]!.hasAttribute.bind(nodes[1])
  nodes[1]!.hasAttribute = function (name) {
    expect(engine.first('i:nth-child(3n)')).toBe(nodes[2])
    return original(name)
  }
  expect(engine.first('i[data-hit]:nth-child(2n)')).toBe(nodes[3])
  expect(engine.match('i:nth-child(2n)', nodes[3]!)).toBe(true)
})

test('registered predicates keep live sibling counting during first queries', t => {
  const { window } = new JSDOM(
    '<!doctype html><main><i></i><i></i><i></i><i></i></main>',
  )
  t.onTestFinished(() => window.close())
  const engine = factory(window)
  const nodes = Array.from(window.document.getElementsByTagName('i'))
  Reflect.set(engine.Snapshot, 'mutatePosition', (element: Element) => {
    if (element === nodes[1]) {
      nodes[0]!.remove()
      return false
    }
    return true
  })
  engine.registerSelector(
    'mutatePosition',
    /^:mutatePosition(.*)/,
    (match, source) => ({
      match,
      source: 'if(s.mutatePosition(e)){' + source + '}',
      status: true,
    }),
  )
  expect(engine.first('i:mutatePosition:nth-child(2n)')).toBeNull()
})
