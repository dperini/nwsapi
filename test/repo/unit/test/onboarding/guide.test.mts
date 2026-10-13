import { expect, test } from 'vitest'
import { guideOutcomeCode } from '../../../../../scripts/repo/test/onboarding/guide.mts'

test('reports a verified Windows process-tree shutdown as completed', () => {
  expect(guideOutcomeCode({ code: 1 }, true)).toBe(0)
  expect(guideOutcomeCode({ code: 143 }, false)).toBe(143)
})
