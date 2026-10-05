import { expect, test } from 'vitest'
import {
  comparableCosts,
  summarizeOracle,
} from '../../../../../../scripts/repo/bench/planner/neural/oracle.mts'
import type { TrainingRow } from '../../../../../../scripts/repo/bench/planner/neural/export.mts'

function row(id: string, costsNs: [number, number]): TrainingRow {
  return {
    id,
    family: 'fixture',
    groupId: 'fixture',
    split: 'train',
    host: 'chromium',
    features: [32, 128, 3, 4],
    costsNs,
    costSamplesNs: [[], []],
    baselineCostNs: 100,
    baselineSamplesNs: [],
    decisionReached: true,
    baselineRoute: 'forward',
    routeFacts: {
      eligible: true,
      anchors: 32,
      witnesses: 128,
      denseInverse: false,
      weakMapAvailable: true,
    },
  }
}

test('oracle discounts baseline aliases and cannot distinguish equal inputs', () => {
  const first = row('first', [90, 50])
  const second = row('second', [90, 400])
  expect(comparableCosts(first)).toEqual([100, 100, 50])
  const summary = summarizeOracle([first, second])
  expect(summary.conservativeSpeedRatio).toBeCloseTo(Math.sqrt(2))
  expect(summary.currentInputEmpiricalSpeedRatio).toBe(1)
  expect(summary.featureGroups).toBe(1)
  expect(comparableCosts({ ...first, decisionReached: false })).toEqual([
    100, 100, 100,
  ])
})
