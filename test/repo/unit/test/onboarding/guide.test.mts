import { expect, test } from 'vitest'
import {
  guideShutdownExpected,
  guideOutcomeCode,
  taskkillOutcome,
} from '../../../../../scripts/repo/test/onboarding/guide.mts'

test('reports a verified Windows process-tree shutdown as completed', () => {
  expect(guideOutcomeCode({ code: 1 }, true)).toBe(0)
  expect(guideOutcomeCode({ code: 143 }, false)).toBe(143)
})

test('accepts taskkill status 128 when the guide process already exited', () => {
  expect(taskkillOutcome(0, null)).toBe('terminated')
  expect(taskkillOutcome(128, null)).toBe('already-stopped')
  expect(() => taskkillOutcome(1, null)).toThrow(
    'Guide process-tree shutdown failed: taskkill exit=1 signal=null.',
  )
  expect(
    guideShutdownExpected({ code: 0, signal: null }, false, true, true),
  ).toBe(true)
  expect(
    guideShutdownExpected({ code: 0, signal: null }, false, true, false),
  ).toBe(false)
  expect(
    guideShutdownExpected({ code: 1, signal: null }, false, true, true),
  ).toBe(false)
})
