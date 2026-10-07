import assert from 'node:assert/strict'
import { parse } from 'css-tree'
import { test } from 'vitest'
import { cases } from '../../../../../scripts/repo/bench/cases.mts'
import { expandedCases } from '../../../../../scripts/repo/bench/survey/coverage.mts'

test('expanded survey retains established workload cases and adds valid neighboring selector forms', () => {
  const groups = Object.entries(expandedCases)
  let count = 0
  for (let index = 0, length = groups.length; index < length; index += 1) {
    const [name, categories] = groups[index]!
    const existing = Object.entries(cases[name]!)
    for (let base = 0, size = existing.length; base < size; base += 1) {
      const [category, selectors] = existing[base]!
      assert.deepEqual(
        (categories as Record<string, string[]>)[category],
        selectors,
      )
    }
    const queries = Object.values(categories).flat()
    for (let query = 0, size = queries.length; query < size; query += 1) {
      assert.equal(
        parse(queries[query]!, { context: 'selectorList' }).type,
        'SelectorList',
      )
      count += 1
    }
  }
  assert.equal(count, 68)
})
