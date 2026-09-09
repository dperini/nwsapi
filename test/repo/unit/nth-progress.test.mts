import { JSDOM } from 'jsdom'
import { expect, test } from 'vitest'
import factory from '../../../src/nwsapi.js'

test('positional plans handle dense, sparse, nested, and moved candidates', t => {
  const { window } = new JSDOM('<!doctype html><main></main><aside></aside>')
  t.onTestFinished(() => window.close())
  const { document } = window
  const engine = factory(window)
  const main = document.querySelector('main')!
  const aside = document.querySelector('aside')!
  main.innerHTML = '<i></i>'.repeat(80)
  aside.innerHTML = ('<b></b>'.repeat(12) + '<i><i></i></i>').repeat(12)
  const selectors = [
    'i:nth-child(2n)',
    'i:nth-child(3n+1)',
    'i:nth-child(-n+20)',
    'i:nth-child(2n):nth-child(3n+1)',
    'i:not(:nth-child(2n))',
    'i:nth-child(2n) + i',
    'i:nth-child(2n) i',
    ':nth-child(2n) > i',
  ]
  for (const [index, element] of [
    ...document.querySelectorAll('*'),
  ].entries()) {
    element.id = `node-${index}`
  }
  const check = (context: Document | DocumentFragment) => {
    // Query a fresh tree: the competitor can retain stale sibling positions
    // after moving nodes, which is exactly the behavior this test guards.
    const reference = context.cloneNode(true) as Document | DocumentFragment
    for (const selector of selectors) {
      expect(
        Array.from(engine.select(selector, context)).map(e => e.id),
        selector,
      ).toEqual([...reference.querySelectorAll(selector)].map(e => e.id))
    }
  }
  check(document)
  main.prepend(document.createElement('b'))
  aside.append(main.children[30]!)
  main.insertBefore(document.createTextNode(' '), main.children[4]!)
  main.insertBefore(document.createComment('gap'), main.children[20]!)
  check(document)
  const fragment = document.createDocumentFragment()
  fragment.append(main, aside)
  check(fragment)
  const candidates = [...fragment.querySelectorAll('i')].toReversed()
  const resolve = engine.compile(':nth-child(3n+1)', true)!
  expect(resolve(candidates, null, fragment, [])).toEqual(
    candidates.filter(
      element => [...element.parentNode!.children].indexOf(element) % 3 === 0,
    ),
  )
})

test('typed positions preserve parent groups with reordered candidates and thrown callbacks', t => {
  const { window } = new JSDOM(
    '<main><p></p><p></p><p></p></main><aside><b></b></aside>',
  )
  t.onTestFinished(() => window.close())
  const engine = factory(window)
  const nodes = [...window.document.querySelectorAll('p')]
  const lone = window.document.querySelector('b')!
  const resolve = engine.compile(':nth-last-of-type(3)', true)!
  expect(
    resolve([nodes[0], lone, nodes[0]], null, window.document, []),
  ).toEqual([nodes[0], nodes[0]])
  const callback = engine.compile(':nth-of-type(2n)', true, true)!
  expect(() =>
    callback(
      nodes,
      () => {
        throw new Error('stop')
      },
      null,
      [],
    ),
  ).toThrow('stop')
  nodes[0]!.before(window.document.createElement('p'))
  expect(engine.select('p:nth-of-type(2n)')).toEqual([nodes[0], nodes[2]])
})
