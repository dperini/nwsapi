import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'
import { afterEach, test, vi } from 'vitest'

const state = vi.hoisted(() => ({ read: vi.fn(), write: vi.fn() }))
vi.mock('node:fs', () => ({
  readFileSync: state.read,
  writeFileSync: state.write,
}))
afterEach(() => vi.clearAllMocks())

test('neural report applies decision overhead only to model-handled measurements', async () => {
  const originalArgs = process.argv
  vi.spyOn(console, 'log').mockImplementation(() => {})
  const result = {
    cases: 2,
    speedupVsProductionRule: 2,
    speedupProductionVsAlwaysForward: 2,
    modelApplications: 1,
    fallbackApplications: 1,
    speedupVsProductionRuleTiming95CI: [0.4, 0.6],
    simpleRatioRule: { speedupVsProductionRule: 1.5 },
    tunedRatioRule: { speedupVsProductionRule: 1.25 },
    tunedRatioRuleThreshold: 2,
    routeCostSummary: {
      selectedRouteCostsNs: [50, 50],
      productionRouteCostsNs: [100, 100],
      modelApplied: [true, false],
    },
  }
  const evaluation = {
    model: 'network',
    trainingFramework: 'PyTorch',
    device: 'CPU',
    selectedEpochs: 10,
    trainingRows: 100,
    validationFamilies: ['train'],
    validationRows: 20,
    heldOutFamilies: ['heldout'],
    heldOutRows: 2,
    reachedEpochLimit: true,
    selectedRatioThreshold: 2,
    inputs: {
      candidateSha256: 'abc',
      fixtureSha256: 'def',
      powerByHost: {
        chromium: "Now drawing from 'AC Power'\n\t95%; charged;",
        jsdom: '',
      },
    },
    results: {
      chromium: result,
      jsdom: {
        ...result,
        speedupVsProductionRule: 0.5,
        routeCostSummary: {
          ...result.routeCostSummary,
          selectedRouteCostsNs: [200, 200],
        },
      },
    },
  }
  const inference = {
    runtime: 'Node',
    platform: 'test',
    modelBytes: 1024,
    callsPerRound: 100,
    rounds: 3,
    results: {
      'in-domain': {
        model: { medianNsPerCall: 60 },
        rule: { medianNsPerCall: 10 },
      },
      fallback: {
        model: { medianNsPerCall: 10 },
        rule: { medianNsPerCall: 10 },
      },
    },
  }
  try {
    for (let index = 0; index < 2; index += 1) {
      vi.resetModules()
      process.argv = index
        ? [originalArgs[0]!, 'report.mts', '/fixture/model']
        : [originalArgs[0]!, 'report.mts']
      state.read.mockImplementation((file: string) =>
        JSON.stringify(
          file.endsWith('evaluation.json')
            ? {
                ...evaluation,
                reachedEpochLimit: Boolean(index),
                inputs: index
                  ? evaluation.inputs
                  : { ...evaluation.inputs, powerByHost: {} },
              }
            : inference,
        ),
      )
      await import('../../../../../../scripts/repo/bench/planner/neural/report.mts')
      const dom = new JSDOM(state.write.mock.calls.at(-1)![1])
      try {
        assert.equal(dom.window.document.querySelectorAll('.host').length, 2)
        assert.equal(
          dom.window.document.querySelectorAll('.host .row').length,
          10,
        )
        assert.equal(dom.window.document.querySelectorAll('tbody tr').length, 2)
        const adjusted = dom.window.document.querySelector('.bar.adjusted')!
        assert.ok(
          Number.parseFloat(adjusted.getAttribute('style')!.split(':')[1]!) >
            50,
        )
        assert.equal(
          dom.window.document.querySelector('.host .row:nth-child(3) strong')!
            .textContent,
          '50.00',
        )
      } finally {
        dom.window.close()
      }
    }
  } finally {
    process.argv = originalArgs
  }
})
