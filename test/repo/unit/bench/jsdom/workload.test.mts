import { invoke, profile, state } from './workload/fixture.mts'
import { expect, test, vi } from 'vitest'
const base = ['--host', '/prepared', '--wpt', '/wpt']
test.each([false, true])(
  'controller preserves alternating trials and optional profiles explicit=%s',
  async explicit => {
    const module = await invoke(
      explicit
        ? [
            ...base,
            '--trials',
            '3',
            '--output',
            '/report',
            '--profile',
            '/profile',
          ]
        : base,
    )
    const report = JSON.parse(state.write.mock.calls[0]![1] as string)
    expect(
      report.samples.map((sample: { engine: string }) => sample.engine),
    ).toEqual(
      explicit
        ? [
            'baseline',
            'candidate',
            'candidate',
            'baseline',
            'baseline',
            'candidate',
          ]
        : [
            'baseline',
            'candidate',
            'candidate',
            'baseline',
            'baseline',
            'candidate',
            'candidate',
            'baseline',
            'baseline',
            'candidate',
          ],
    )
    expect(report.trials).toBe(explicit ? 3 : 5)
    expect(Object.keys(report.inputHashes)).toHaveLength(4)
    expect(report.engines.baseline.rangeMs.median).toBeGreaterThan(0)
    expect(Object.keys(report.profiles)).toHaveLength(explicit ? 2 : 0)
    const summary = module.summarizeProfile(profile)
    expect(summary.totalSampleMs).toBe(5)
    expect(summary.selectorInclusivePercent).toBe(80)
    expect(summary.topSelfSamples).toHaveLength(5)
    const empty = module.summarizeProfile({
      startTime: 0,
      endTime: 0,
      nodes: [],
    })
    expect(empty.totalSampleMs).toBe(0)
    expect(empty.topSelfSamples).toEqual([])
  },
)
test.each(['baseline', 'candidate'])(
  'worker validates harness callbacks and lifecycle %s',
  async worker => {
    const log = vi.spyOn(console, 'log')
    await invoke([
      ...base,
      '--worker',
      worker,
      ...(worker === 'candidate' ? ['--profile', '/worker.cpuprofile'] : []),
    ])
    const report = JSON.parse(log.mock.calls[0]![0] as string)
    expect(report.range.tests).toBe(2808)
    expect(report.range.failures).toEqual([])
    expect(report.range.errors).toEqual([])
    expect(state.close).toHaveBeenCalledTimes(41)
    expect(state.resources).toHaveLength(2)
    expect((await state.resources[0]!.text()).length).toBeGreaterThan(0)
    expect(
      (await state.resources[1]!.arrayBuffer()).byteLength,
    ).toBeGreaterThan(0)
    if (worker === 'candidate') {
      expect(state.cache['/prepared/adapter.js'].exports).toBe(state.candidate)
      expect(state.disconnect).toHaveBeenCalledOnce()
      expect(state.write).toHaveBeenCalledTimes(2)
    } else {
      expect(state.connect).not.toHaveBeenCalled()
    }
  },
)
test.each(['foreign', 'resource', 'error', 'count', 'failure', 'status'])(
  'worker rejects invalid %s harness conditions',
  async mode => {
    state.mode = mode
    await expect(
      invoke([...base, '--worker', 'baseline']),
    ).rejects.toMatchObject({ code: 'ERR_ASSERTION' })
  },
)
test.each([
  { args: [] },
  { args: [...base, '--worker', 'unknown'] },
  { args: [...base, '--trials', '2'] },
  { args: [...base, '--trials', '1.5'] },
])('invalid workload arguments fail $args', async ({ args }) => {
  await expect(invoke(args)).rejects.toMatchObject({ code: 'ERR_ASSERTION' })
  expect(state.write).not.toHaveBeenCalled()
})
