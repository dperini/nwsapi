import assert from 'node:assert/strict'
import { test } from 'vitest'
import { JSDOM, type DOMWindow } from 'jsdom'
import factory from '../../../../../dist/nwsapi.js'

test('a shared parent can reject a sibling chain before walking its children', t => {
  const count = 256
  const markup =
    '<i class="item"></i>'.repeat(count) +
    '<b class="target"></b>'.repeat(count)
  const { window } = new JSDOM(`<!doctype html><section>${markup}</section>`)
  t.onTestFinished(() => window.close())
  const { document } = window
  const engine = factory(window)
  const selector = 'section.root > .item ~ .target'
  const expected = Array.from(document.querySelectorAll(selector))
  assert.deepEqual(Array.from(engine.select(selector, document)), expected)

  const counts = {
    parent: countGetter(window, 'parentElement'),
    previous: countGetter(window, 'previousElementSibling'),
    next: countGetter(window, 'nextElementSibling'),
  }
  try {
    assert.deepEqual(Array.from(engine.select(selector, document)), expected)
    assert.equal(counts.parent.get(), count)
    assert.equal(counts.previous.get(), 0)
    assert.equal(counts.next.get(), 0)
  } finally {
    counts.parent.restore()
    counts.previous.restore()
    counts.next.restore()
  }
})

test('the parent-gated route stays live and preserves callbacks', t => {
  const { window } = new JSDOM(
    '<!doctype html><section class="root"><i class="item"></i><b class="target"></b>' +
      '<b class="target"></b></section>',
  )
  t.onTestFinished(() => window.close())
  const { document } = window
  const engine = factory(window)
  const selector = 'section.root > .item ~ .target'
  const targets = Array.from(document.querySelectorAll('.target'))
  const counts = {
    parent: countGetter(window, 'parentElement'),
    previous: countGetter(window, 'previousElementSibling'),
    next: countGetter(window, 'nextElementSibling'),
  }

  try {
    assert.deepEqual(Array.from(engine.select(selector, document)), targets)
    assert.ok(counts.parent.get() <= targets.length + 8)
    assert.equal(counts.previous.get(), 0)
    assert.ok(counts.next.get() <= 16)
  } finally {
    counts.parent.restore()
    counts.previous.restore()
    counts.next.restore()
  }
  document.querySelector('section')!.className = 'other'
  assert.deepEqual(Array.from(engine.select(selector, document)), [])

  document.querySelector('section')!.className = 'root'
  const seen: Element[] = []
  assert.deepEqual(
    Array.from(
      engine.select(selector, document, element => {
        seen.push(element as HTMLElement)
        return true
      }),
    ),
    targets,
  )
  assert.deepEqual(seen, targets)
})

test('parent-gated sibling chains preserve order across nested parents', t => {
  const { window } = new JSDOM(
    '<!doctype html><section class="root"><i class="item"></i>' +
      '<b id="before" class="target"></b><div class="root">' +
      '<i class="item"></i><b id="nested" class="target"></b></div>' +
      '<b id="after" class="target"></b></section>',
  )
  t.onTestFinished(() => window.close())
  const { document } = window
  const engine = factory(window)
  const selector = '.root > .item ~ .target'
  const expected = Array.from(document.querySelectorAll(selector))

  assert.deepEqual(Array.from(engine.select(selector, document)), expected)
  assert.deepEqual(
    expected.map(element => element.id),
    ['before', 'nested', 'after'],
  )
})

function countGetter(window: DOMWindow, name: string) {
  let owner = window.Element.prototype
  let descriptor: PropertyDescriptor | undefined
  while (
    owner &&
    !(descriptor = Object.getOwnPropertyDescriptor(owner, name))
  ) {
    owner = Object.getPrototypeOf(owner)
  }
  assert.ok(owner && typeof descriptor?.get === 'function')
  let count = 0
  const original = descriptor
  Object.defineProperty(owner, name, {
    ...original,
    get() {
      count++
      return original.get!.call(this)
    },
  })
  return {
    get: () => count,
    restore: () => Object.defineProperty(owner, name, original),
  }
}
