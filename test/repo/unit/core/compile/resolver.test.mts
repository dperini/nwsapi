import assert from 'node:assert/strict'
import { test } from 'vitest'
import { JSDOM } from 'jsdom'
import factory from '../../../../../dist/nwsapi.js'

test('matching reads nearby ancestors and siblings once when cached', t => {
  const { window } = new JSDOM(
    '<main><div class="a"><div class="a"><i class="leaf"></i></div></div></main>' +
      '<aside></aside><div class="a"></div><div class="a"></div>' +
      '<i id="sibling-leaf" class="leaf"></i>',
  )
  t.onTestFinished(() => window.close())
  const { document } = window
  const engine = factory(window)
  const leaf = document.querySelector('main .leaf')!
  const siblingLeaf = document.getElementById('sibling-leaf')!
  const parent = countGetter(leaf, 'parentElement')
  const sibling = countGetter(siblingLeaf, 'previousElementSibling')

  try {
    for (const [selector, candidate, reads] of [
      ['.a .leaf', leaf, parent],
      ['.a ~ .leaf', siblingLeaf, sibling],
    ] as const) {
      for (let run = 0; run < 2; run++) {
        assert.equal(engine.match(selector, candidate), true)
        assert.equal(reads.reads(), 1)
        reads.clear()
      }
    }
  } finally {
    parent.restore()
    sibling.restore()
  }
})

test('matching backtracks through repeated ancestor qualifiers', t => {
  const { window } = new JSDOM(
    '<main class="root"><div class="a"><div class="a">' +
      '<i class="leaf"></i></div></div></main>',
  )
  t.onTestFinished(() => window.close())
  const { document } = window
  const engine = factory(window)
  const leaf = document.querySelector('i')!
  const selector = '.root > .a .leaf'

  assert.equal(engine.match(selector, leaf), true)
  assert.equal(engine.match(selector, leaf), true)
  document.querySelector('main')!.className = 'other'
  assert.equal(engine.match(selector, leaf), false)

  const siblings = new JSDOM(
    '<aside class="root"></aside><div class="a"></div>' +
      '<div class="a"></div><i class="leaf"></i>',
  )
  t.onTestFinished(() => siblings.window.close())
  const siblingEngine = factory(siblings.window)
  const siblingLeaf = siblings.window.document.querySelector('i')!
  const siblingSelector = '.root + .a ~ .leaf'
  assert.equal(siblingEngine.match(siblingSelector, siblingLeaf), true)
  siblings.window.document.querySelector('aside')!.className = 'other'
  assert.equal(siblingEngine.match(siblingSelector, siblingLeaf), false)
})

test('matching callbacks run for repeated qualifiers and stay cached', t => {
  const { window } = new JSDOM(
    '<main><div class="a"><div class="a"><i class="leaf"></i></div></div></main>',
  )
  t.onTestFinished(() => window.close())
  const { document } = window
  const engine = factory(window)
  const leaf = document.querySelector('i')!
  const selector = '.a .leaf'
  const seen: Element[] = []

  assert.equal(
    engine.match(selector, leaf, element => {
      seen.push(element as HTMLElement)
      return false
    }),
    true,
  )
  assert.deepEqual(seen, [leaf, leaf])
  assert.equal(engine.match(selector, leaf), true)
  assert.equal(
    engine.match(selector, leaf, element => {
      seen.push(element as HTMLElement)
      return true
    }),
    true,
  )
  assert.deepEqual(seen, [leaf, leaf, leaf, leaf])
})

test('early matching exits clear positional and logical state', t => {
  const { window } = new JSDOM(
    '<main><ul><li class="root"><i class="leaf"></i></li>' +
      '<li></li><li></li></ul><div class="root">' +
      '<span class="leaf"></span></div></main>',
  )
  t.onTestFinished(() => window.close())
  const { document } = window
  const engine = factory(window)
  const item = document.querySelector('li')!
  const leaf = item.querySelector('i')!
  const selector = 'li:nth-child(2n+1) > .leaf'

  assert.equal(engine.match(selector, leaf), true)
  assert.equal(engine.match('li:nth-of-type(2n+1) > .leaf', leaf), true)
  item.before(document.createElement('li'))
  assert.equal(engine.match(selector, leaf), false)
  assert.equal(engine.match('li:nth-of-type(2n+1) > .leaf', leaf), false)
  item.previousElementSibling!.remove()
  assert.equal(engine.match(selector, leaf), true)

  const host = document.querySelector('div')!
  const span = host.querySelector('span')!
  assert.equal(engine.match('.root:has(> .leaf) > .leaf', span), true)
  span.remove()
  assert.equal(engine.match('.root:has(> .leaf) > .leaf', span), false)
  host.append(span)
  assert.equal(engine.match('.root:has(> .leaf) > .leaf', span), true)
  assert.equal(engine.match('.root:has(.leaf) > .leaf', span), true)
  assert.equal(engine.match(':is(.root) > :not(.missing)', span), true)
})

function countGetter(element: Element, name: string) {
  let prototype: object | null = Object.getPrototypeOf(element)
  let descriptor: PropertyDescriptor | undefined
  while (prototype && !descriptor) {
    descriptor = Object.getOwnPropertyDescriptor(prototype, name)
    if (!descriptor) {
      prototype = Object.getPrototypeOf(prototype)
    }
  }
  assert.ok(prototype && typeof descriptor?.get === 'function')
  const original = descriptor
  let reads = 0
  Object.defineProperty(prototype, name, {
    ...original,
    get() {
      reads++
      return original.get!.call(this)
    },
  })
  return {
    reads: () => reads,
    clear: () => {
      reads = 0
    },
    restore: () => {
      Object.defineProperty(prototype, name, original)
    },
  }
}
