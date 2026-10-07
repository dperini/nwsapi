import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'
import { test } from 'vitest'
import { fixtures } from '../../../../../scripts/repo/bench/planner/fixtures.mts'

test('planner fixture families keep independent evaluation layouts and exact selected tags', () => {
  const entries = fixtures()
  assert.equal(entries.length, 96)
  assert.equal(new Set(entries.map(entry => entry.id)).size, entries.length)
  const families = new Set(entries.map(entry => entry.family))
  assert.equal(families.size, 6)
  const selected = entries.filter(entry => entry.id.endsWith('-128-2-0.4'))
  for (let index = 0, length = selected.length; index < length; index += 1) {
    const entry = selected[index]!
    const dom = new JSDOM(entry.html)
    try {
      const matches = Array.from(
        dom.window.document.querySelectorAll(entry.selector),
      )
      assert.equal(matches.length, Math.floor(128 * 0.4))
      assert.ok(matches.every(node => entry.tags.includes(node.localName)))
      assert.equal(
        entry.split,
        ['flat', 'nested', 'alternating'].includes(entry.family)
          ? 'train'
          : 'holdout',
      )
    } finally {
      dom.window.close()
    }
  }
})
