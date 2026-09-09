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
  for (const layout of ['adjacent', 'separated', 'nested'] as const) {
    const doc = new window.DOMParser().parseFromString(
      fixture(16, 4, layout),
      'text/html',
    )
    assert.equal(doc.querySelectorAll('p').length, 256)
    const expected = Array.from(doc.querySelectorAll('.hit'))
    assert.equal(expected.length, 16)
    checkResults(doc.querySelectorAll(selectors(4)[1]!), expected)
    assert.throws(() => checkResults(expected.slice(1), expected))
    assert.throws(() => checkResults(expected.toReversed(), expected))
    assert.throws(() =>
      checkResults([expected[0]!, ...expected.slice(0, -1)], expected),
    )
  }
})
