import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'
import { test } from 'vitest'
import { cases } from '../../../../scripts/repo/bench/cases.mts'
import { DOCUMENTS } from '../../../../scripts/repo/bench/documents.mts'

test('benchmark selector catalog resolves against each owning workload without syntax failures', () => {
  const groups = Object.entries(cases)
  let selectors = 0
  let nonempty = 0
  for (let index = 0, length = groups.length; index < length; index += 1) {
    const [name, categories] = groups[index]!
    const dom = new JSDOM(DOCUMENTS[name as keyof typeof DOCUMENTS].html())
    try {
      const queries = Object.values(categories).flat()
      assert.equal(new Set(queries).size, queries.length)
      for (let query = 0, count = queries.length; query < count; query += 1) {
        const result = dom.window.document.querySelectorAll(queries[query]!)
        selectors += 1
        nonempty += Number(result.length > 0)
      }
    } finally {
      dom.window.close()
    }
  }
  assert.equal(selectors, 36)
  assert.ok(nonempty > 20)
})
