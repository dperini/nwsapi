import { JSDOM } from 'jsdom'
import { expect, test } from 'vitest'
import { cases } from '../../../../../scripts/repo/bench/port/cases.mts'

test('port cases cover ordered selection and matching with hits and misses', () => {
  const outcomes = cases.map(entry => {
    const dom = new JSDOM(entry.markup)
    try {
      const document = dom.window.document
      const target =
        document.querySelector(entry.target || '.leaf') ||
        document.querySelector('section')!
      return {
        name: entry.name,
        matched: entry.match
          ? target.matches(entry.selector)
          : document.querySelectorAll(entry.selector).length > 0,
      }
    } finally {
      dom.window.close()
    }
  })
  expect(outcomes).toHaveLength(12)
  expect(outcomes.some(entry => entry.matched)).toBe(true)
  expect(outcomes.some(entry => !entry.matched)).toBe(true)
  expect(new Set(outcomes.map(entry => entry.name)).size).toBe(12)
})
