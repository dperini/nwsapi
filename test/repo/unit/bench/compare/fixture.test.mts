import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'
import { test } from 'vitest'
import {
  fixture,
  selectors,
  checkResults,
} from '../../../../../scripts/repo/bench/compare/fixture.mts'

test('comparison fixtures preserve matches across layouts and reject bad results', t => {
  const { window } = new JSDOM()
  t.onTestFinished(() => window.close())
  const baseline = new window.DOMParser().parseFromString(
    fixture(1, 4, 'adjacent'),
    'text/html',
  )
  assert.equal(baseline.querySelectorAll('p').length, 256)
  for (const scenario of ['ancestor', 'has', 'sibling'] as const) {
    for (const matches of [0, 1, 8]) {
      const doc = new window.DOMParser().parseFromString(
        fixture(matches, 4, 'nested', scenario, 8),
        'text/html',
      )
      for (const selector of selectors(4, scenario)) {
        assert.equal(doc.querySelectorAll(selector).length, matches)
      }
    }
  }
  for (const layout of ['adjacent', 'separated', 'nested'] as const) {
    const doc = new window.DOMParser().parseFromString(
      fixture(4, 4, layout, 'grouped', 8),
      'text/html',
    )
    assert.equal(doc.querySelectorAll('p').length, 8)
    const expected = Array.from(doc.querySelectorAll('.hit'))
    assert.equal(expected.length, 4)
    checkResults(doc.querySelectorAll(selectors(4)[1]!), expected)
    assert.throws(() => checkResults(expected.slice(1), expected))
    assert.throws(() => checkResults(expected.toReversed(), expected))
    assert.throws(() =>
      checkResults([expected[0]!, ...expected.slice(0, -1)], expected),
    )
  }
})
