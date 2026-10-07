import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'
import { test } from 'vitest'
import {
  bar,
  geomean,
  timeChange,
} from '../../../../../scripts/repo/bench/planner/display.mts'

test('planner displays geometric time changes and safe normalized bars', () => {
  assert.equal(geomean([0.5, 2]), 1)
  assert.equal(timeChange(1), 'About the same query time')
  assert.equal(timeChange(0.8), '20.0% less query time')
  assert.equal(timeChange(1.2), '20.0% more query time')
  const document = new JSDOM(
    bar('<model>', 120, 200, 'model') +
      bar('rule', 100, 200, 'rule') +
      bar('fast', 80, 200, 'model'),
  ).window.document
  assert.equal(document.querySelector('.label span')!.textContent, '<model>')
  assert.equal(document.querySelector('.bar')!.className, 'bar slower')
  assert.equal(
    (document.querySelector('.bar') as HTMLElement).style.width,
    '60%',
  )
  assert.deepEqual(
    Array.from(document.querySelectorAll('.bar'), node => node.className),
    ['bar slower', 'bar rule', 'bar model'],
  )
  assert.equal(
    document.querySelectorAll('.bar-note')[1]!.textContent,
    'Reference',
  )
  document.defaultView!.close()
})
