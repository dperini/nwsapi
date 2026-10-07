import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'
import { test } from 'vitest'
import { cases } from '../../../../../scripts/repo/bench/port/cases.mts'

test('port comparison cases contain both exact matches and meaningful misses', () => {
  assert.equal(new Set(cases.map(entry => entry.name)).size, cases.length)
  let hits = 0
  let misses = 0
  for (let index = 0, length = cases.length; index < length; index += 1) {
    const entry = cases[index]!
    const dom = new JSDOM(entry.markup)
    try {
      const target = dom.window.document.querySelector(entry.target ?? '.leaf')
      const count = entry.match
        ? Number(target?.matches(entry.selector))
        : dom.window.document.querySelectorAll(entry.selector).length
      hits += Number(count > 0)
      misses += Number(count === 0)
    } finally {
      dom.window.close()
    }
  }
  assert.ok(hits > 0)
  assert.ok(misses > 0)
})
