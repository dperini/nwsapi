import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import path from 'node:path'
import { JSDOM } from 'jsdom'
import type factoryType from '../../../../dist/nwsapi.js'
import { REPO_ROOT } from '../../lib/paths.mts'

const name = process.argv[2]
const iterations = 1500
const cases = ['simple', 'descendant', 'has'] as const
if (!cases.includes(name as (typeof cases)[number])) {
  throw new Error(`Choose one workload: ${cases.join(', ')}.`)
}

const { window } = new JSDOM('<!doctype html><main></main>')
try {
  const { document } = window
  const main = document.querySelector('main')!
  const cards: Element[] = []
  const activeItems: Element[] = []
  const selectedItems: Element[] = []
  for (let cardIndex = 0; cardIndex < 64; cardIndex++) {
    const card = document.createElement('article')
    card.className = 'card'
    main.append(card)
    cards.push(card)
    for (let itemIndex = 0; itemIndex < 8; itemIndex++) {
      const item = document.createElement('span')
      item.className = 'item'
      if (itemIndex % 4 === 0) {
        item.classList.add('active')
        activeItems.push(item)
      }
      if (itemIndex === 0) {
        item.classList.add('selected')
        selectedItems.push(item)
      }
      card.append(item)
    }
  }

  const workloads = {
    simple: { selector: '.item.active', expected: activeItems },
    descendant: {
      selector: 'main .card > .item.selected',
      expected: selectedItems,
    },
    has: { selector: '.card:has(> .item.active)', expected: cards },
  }
  const workload = workloads[name as keyof typeof workloads]
  const require = createRequire(import.meta.url)
  const factory = require(
    path.join(REPO_ROOT, 'dist/nwsapi.js'),
  ) as typeof factoryType
  const engine = factory(window)
  const select = () => Array.from(engine.select(workload.selector, document))
  assert.deepEqual(select(), workload.expected)

  let resultCount = 0
  for (let iteration = 0; iteration < iterations; iteration++) {
    resultCount += engine.select(workload.selector, document).length
  }
  assert.equal(resultCount, workload.expected.length * iterations)
  assert.deepEqual(select(), workload.expected)
  console.log(`${name}: ${iterations} checked query executions`)
} finally {
  window.close()
}
