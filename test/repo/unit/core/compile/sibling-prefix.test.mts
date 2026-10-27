import assert from 'node:assert/strict'
import { test } from 'vitest'
import { JSDOM } from 'jsdom'
import factory from '../../../../../dist/nwsapi.js'

test('sibling-prefix selection agrees with native selection across contexts', t => {
  for (const markup of [
    '<main><i class="a"></i><b class="b"></b><b class="b"></b></main>',
    '<main><i></i><b class="b"></b><i class="a"></i><b class="b"></b></main>',
    '<main><i class="a"></i><b class="b"><i class="a"></i>' +
      '<b class="b"></b></b><b class="b"></b></main>',
  ]) {
    const { window } = new JSDOM(markup)
    t.onTestFinished(() => window.close())
    const { document } = window
    const engine = factory(window)
    const root = document.querySelector('main')!
    for (const selector of ['.a ~ .b', 'i.a ~ b.b']) {
      assert.deepEqual(engine.select(selector, root), [
        ...root.querySelectorAll(selector),
      ])
      for (const candidate of root.querySelectorAll('b')) {
        assert.equal(
          engine.match(selector, candidate),
          candidate.matches(selector),
        )
      }
    }
  }
  const { window } = new JSDOM(
    '<main><i data-a="x~y"></i><b class="b"></b></main>',
  )
  t.onTestFinished(() => window.close())
  const root = window.document.querySelector('main')!
  const selector = '[data-a="x~y"] ~ [class~="b"]'
  assert.deepEqual(factory(window).select(selector, root), [
    ...root.querySelectorAll(selector),
  ])
})

test('sibling-prefix cache is scoped to each call and follows mutations', t => {
  const { window } = new JSDOM(
    '<main><section><i class="a"></i><b class="b"></b></section>' +
      '<section><i></i><b class="b"></b></section></main>',
  )
  t.onTestFinished(() => window.close())
  const { document } = window
  const engine = factory(window)
  const root = document.querySelector('main')!
  const left = root.querySelector('i')!
  const right = root.querySelector('b')!

  assert.deepEqual(engine.select('.a ~ .b', root), [right])
  left.className = 'other'
  assert.deepEqual(engine.select('.a ~ .b', root), [])
  left.className = 'a'
  assert.deepEqual(engine.select('.a ~ .b', root), [right])
  const otherParent = document.createElement('section')
  root.append(otherParent)
  otherParent.append(left)
  assert.deepEqual(engine.select('.a ~ .b', root), [])
  root.firstElementChild!.insertBefore(left, right)
  assert.deepEqual(engine.select('.a ~ .b', root), [right])
  assert.deepEqual(engine.select('.a ~ .b', root), [
    ...root.querySelectorAll('.a ~ .b'),
  ])
})

test('compiled selector handles candidates in reverse document order', t => {
  const { window } = new JSDOM(
    '<main><b class="b"></b><i class="a"></i><b class="b"></b>' +
      '<b class="b"></b><b class="b"></b></main>',
  )
  t.onTestFinished(() => window.close())
  const { document } = window
  const engine = factory(window)
  const root = document.querySelector('main')!
  const candidates = [...root.querySelectorAll('b')].toReversed()
  const resolver = engine.compile('.a ~ .b', true, false)!

  assert.deepEqual(resolver(candidates, null, root, []), candidates.slice(1))
})

test('sibling-prefix selection handles fragments and XML element contexts', t => {
  const { window } = new JSDOM(
    '<root><row><i class="a"/><b class="b"/></row></root>',
    {
      contentType: 'text/xml',
    },
  )
  t.onTestFinished(() => window.close())
  const { document } = window
  const engine = factory(window)
  const row = document.querySelector('row')!
  assert.deepEqual(engine.select('.a ~ .b', row), [
    ...row.querySelectorAll('.a ~ .b'),
  ])

  const fragment = document.createDocumentFragment()
  const prefix = document.createElement('i')
  prefix.className = 'a'
  const candidate = document.createElement('b')
  candidate.className = 'b'
  fragment.append(prefix, candidate)
  assert.deepEqual(engine.select('.a ~ .b', fragment), [candidate])
  assert.equal(engine.match('.a ~ .b', candidate), true)
})

test('sibling-prefix path declines callbacks and longer chains', t => {
  const { window } = new JSDOM(
    '<main><i class="a"></i><b class="b"></b></main>',
  )
  t.onTestFinished(() => window.close())
  const { document } = window
  const engine = factory(window)
  const root = document.querySelector('main')!
  const seen: Element[] = []

  assert.deepEqual(
    engine.select('.a ~ .b', root, element => {
      seen.push(element as Element)
      return false
    }),
    [root.lastElementChild],
  )
  assert.equal(seen.length, 1)
  assert.deepEqual(engine.select('.a ~ .b ~ i', root), [])
})

test('sibling-prefix selection bounds previous-sibling reads on wide lists', t => {
  const { window } = new JSDOM(
    '<main>' + '<b class="b"></b>'.repeat(256) + '</main>',
  )
  t.onTestFinished(() => window.close())
  const { document } = window
  const engine = factory(window)
  const root = document.querySelector('main')!
  const prototype = window.Element.prototype
  const descriptor = Object.getOwnPropertyDescriptor(
    prototype,
    'previousElementSibling',
  )!
  let reads = 0

  Object.defineProperty(prototype, 'previousElementSibling', {
    configurable: true,
    get() {
      reads++
      return descriptor.get!.call(this)
    },
  })
  try {
    assert.deepEqual(engine.select('[data-a] ~ .b', root), [])
    assert.ok(reads < 999, `expected bounded sibling reads, got ${reads}`)
  } finally {
    Object.defineProperty(prototype, 'previousElementSibling', descriptor)
  }
})
