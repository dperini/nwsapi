import { readFileSync } from 'node:fs'
import { JSDOM } from 'jsdom'
import { expect, test } from 'vitest'
import { compileProbe } from '../../../../../../scripts/repo/bench/planner/has/evidence.mts'
import {
  fixtures,
  split,
} from '../../../../../../scripts/repo/bench/planner/dispatch/fixtures.mts'
import { dispatchBundle } from '../../../../../../scripts/repo/bench/planner/dispatch/variants.mts'

const baseline = readFileSync(
  new URL('../../../../../../dist/nwsapi.js', import.meta.url),
  'utf8',
)
const entries = fixtures().filter(entry =>
  [
    'flat-32-4-plain',
    'flat-32-4-filtered',
    'flat-32-0-plain',
    'small-8-4-plain',
  ].includes(entry.id),
)

test('an override flips complete routes and preserves preflight exits', () => {
  const factory = compileProbe(
    dispatchBundle(
      baseline,
      'function dispatchOverride() { return true; }',
      true,
    ),
  )
  const routes = []
  for (const entry of entries) {
    const { window } = new JSDOM(entry.html)
    try {
      const engine = factory(window)
      engine.select(entry.selector, window.document)
      factory.resetTrace()
      expect(
        Array.from(engine.select(entry.selector, window.document)),
      ).toEqual(Array.from(window.document.querySelectorAll(entry.selector)))
      routes.push([entry.id, factory.trace().route])
      for (const witness of window.document.querySelectorAll('.witness')) {
        witness.remove()
      }
      expect(
        Array.from(engine.select(entry.selector, window.document)),
      ).toEqual([])
    } finally {
      window.close()
    }
  }
  expect(Object.fromEntries(routes)).toEqual({
    'flat-32-0-plain': 'empty',
    'flat-32-4-plain': 'forward',
    'flat-32-4-filtered': 'inverse',
    'small-8-4-plain': 'ineligible',
  })
})

test('a declined override preserves baseline routes', () => {
  const factory = compileProbe(
    dispatchBundle(
      baseline,
      'function dispatchOverride() { return false; }',
      true,
    ),
  )
  const { window } = new JSDOM(
    entries.find(entry => entry.id === 'flat-32-4-plain')!.html,
  )
  try {
    const engine = factory(window)
    engine.select('.card:has(.witness)', window.document)
    engine.select('.card:has(.witness)', window.document)
    expect(factory.trace().route).toBe('inverse')
  } finally {
    window.close()
  }
})

test('a certified forward-only policy skips inference on inverse routes', () => {
  const factory = compileProbe(
    dispatchBundle(
      baseline,
      'function dispatchOverride() { throw new Error("Inference should be skipped"); }',
      true,
      true,
    ),
  )
  const { window } = new JSDOM(
    entries.find(entry => entry.id === 'flat-32-4-plain')!.html,
  )
  try {
    const engine = factory(window)
    engine.select('.card:has(.witness)', window.document)
    engine.select('.card:has(.witness)', window.document)
    expect(factory.trace().route).toBe('inverse')
  } finally {
    window.close()
  }
})

test('a certified policy can keep or replace the forward route', () => {
  const entry = entries.find(
    candidate => candidate.id === 'flat-32-4-filtered',
  )!
  for (const override of [false, true]) {
    const factory = compileProbe(
      dispatchBundle(
        baseline,
        `function dispatchOverride() { return ${override}; }`,
        true,
        true,
      ),
    )
    const { window } = new JSDOM(entry.html)
    try {
      const engine = factory(window)
      engine.select(entry.selector, window.document)
      factory.resetTrace()
      expect(
        Array.from(engine.select(entry.selector, window.document)),
      ).toEqual(Array.from(window.document.querySelectorAll(entry.selector)))
      expect(factory.trace().route).toBe(override ? 'inverse' : 'forward')
      for (const witness of window.document.querySelectorAll('.witness')) {
        witness.remove()
      }
      expect(
        Array.from(engine.select(entry.selector, window.document)),
      ).toEqual([])
    } finally {
      window.close()
    }
  }
})

test('new synthetic templates have disjoint family splits and truthful seed counts', () => {
  const families = new Map<string, string>()
  const fresh = fixtures().filter(entry =>
    entry.family.startsWith('dispatch-template-'),
  )
  for (const entry of fresh.filter(candidate =>
    candidate.id.includes('-48-'),
  )) {
    const { window } = new JSDOM(entry.html)
    try {
      expect(window.document.querySelectorAll('.card').length).toBe(
        entry.plannerFeatures![0],
      )
      expect(window.document.querySelectorAll('.witness').length).toBe(
        entry.plannerFeatures![1],
      )
      families.set(entry.family, split(entry.family))
    } finally {
      window.close()
    }
  }
  expect(
    [...families.values()].filter(group => group === 'train'),
  ).toHaveLength(6)
  expect(
    [...families.values()].filter(group => group === 'validation'),
  ).toHaveLength(2)
  expect(
    [...families.values()].filter(group => group === 'evaluation'),
  ).toHaveLength(2)
})
