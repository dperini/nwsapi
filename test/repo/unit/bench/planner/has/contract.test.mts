import { expect, test } from 'vitest'
import {
  contractVectors,
  referenceRoute,
} from '../../../../../../scripts/repo/bench/planner/has/contract.mts'

test('route boundaries preserve dense class eligibility and exact exits', () => {
  const facts = {
    eligible: true,
    anchors: 32,
    witnesses: 128,
    denseInverse: true,
    weakMapAvailable: true,
  }
  expect(referenceRoute(facts)).toBe('inverse')
  expect(referenceRoute({ ...facts, denseInverse: false })).toBe('forward')
  expect(referenceRoute({ ...facts, witnesses: 129 })).toBe('forward')
  expect(referenceRoute({ ...facts, anchors: 31, witnesses: null })).toBe(
    'forward',
  )
  expect(
    referenceRoute({ ...facts, witnesses: 0, weakMapAvailable: false }),
  ).toBe('empty')
  expect(referenceRoute({ ...facts, weakMapAvailable: false })).toBe('forward')
  expect(referenceRoute({ ...facts, anchors: 192, witnesses: 768 })).toBe(
    'inverse',
  )
  expect(referenceRoute({ ...facts, anchors: 193, witnesses: 772 })).toBe(
    'forward',
  )
  expect(contractVectors().length).toBeGreaterThan(150)
})

test('unknown counts cannot create an empty result', () => {
  const facts = {
    eligible: true,
    anchors: 32,
    witnesses: null,
    denseInverse: true,
    weakMapAvailable: true,
  }
  expect(() => referenceRoute(facts)).toThrow('witness count')
  expect(() => referenceRoute({ ...facts, witnesses: NaN })).toThrow(
    'witness count',
  )
  expect(() => referenceRoute({ ...facts, anchors: -1 })).toThrow(
    'anchor count',
  )
  expect(referenceRoute({ ...facts, eligible: false })).toBe('ineligible')
})
