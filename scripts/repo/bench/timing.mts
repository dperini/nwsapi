import { createRequire } from 'node:module'
import { do_not_optimize, measure as mitataMeasure } from 'mitata'

const require = createRequire(import.meta.url)
export const timingEngine = {
  name: 'mitata',
  version: require('mitata/package.json').version as string,
}

const measurementOptions = {
  gc: false,
  batch_threshold: 0,
  min_samples: 1,
  // Keep every sample, including scheduling and garbage collection pauses.
  samples_threshold: Infinity,
}

type MitataStats = Awaited<ReturnType<typeof mitataMeasure>>
type MitataOptions = Omit<Parameters<typeof mitataMeasure>[1], 'args'>

// Mitata documents computed parameters, but 1.0.34's declarations omit them.
const measureComputed = mitataMeasure as unknown as <T>(
  setup: () => Generator<{ 0: () => T; bench: (value: T) => unknown }>,
  options: MitataOptions,
) => Promise<MitataStats>

export function median(values: number[]) {
  const sorted = values.toSorted((a, b) => a - b)
  if (!sorted.length) {
    throw new RangeError('A median needs at least one sample.')
  }
  return sorted[(sorted.length - 1) >> 1]!
}

export async function sample(
  fn: () => unknown,
  iterations: number,
  minMilliseconds = 0,
) {
  if (
    !Number.isInteger(iterations) ||
    iterations < 1 ||
    !Number.isFinite(minMilliseconds) ||
    minMilliseconds < 0
  ) {
    throw new RangeError(
      'Use positive iterations and a nonnegative sample duration.',
    )
  }
  const stats = await mitataMeasure(
    () => {
      let result: unknown
      for (let i = 0; i < iterations; ++i) {
        result = fn()
      }
      do_not_optimize(result)
    },
    { ...measurementOptions, min_cpu_time: minMilliseconds * 1e6 },
  )
  return {
    milliseconds: stats.p50 / iterations / 1e6,
    samples: stats.samples.map(value => value / iterations / 1e6),
    calls: stats.samples.length * iterations,
  }
}

// Every invocation, including Mitata's warmup, gets fresh state. Setup is
// outside the timer. The caller owns cleanup for every state created by setup.
export async function sampleFresh<T>(
  setup: () => T,
  query: (state: T) => unknown,
) {
  const stats = await measureComputed(
    function* () {
      yield { 0: setup, bench: query }
    },
    {
      ...measurementOptions,
      min_cpu_time: 0,
      max_samples: 1,
      warmup_samples: 0,
    },
  )
  return stats.p50 / 1e6
}

export async function timeOnce(fn: () => unknown, iterations: number) {
  return (await sample(fn, iterations)).milliseconds
}

// Rotate engine order between rounds to spread changes in machine load.
export async function measure(
  runners: Array<() => unknown>,
  rounds: number,
  iterations: number,
) {
  const samples = runners.map(() => [] as number[])
  for (let round = 0; round < rounds; ++round) {
    for (let offset = 0; offset < runners.length; ++offset) {
      const i = (round + offset) % runners.length
      samples[i]!.push(await timeOnce(runners[i]!, iterations))
    }
  }
  return samples.map(median)
}

export function iterationsFor(ms: number) {
  if (ms > 1) {
    return 20
  }
  if (ms > 0.1) {
    return 100
  }
  return 500
}

export async function compare(
  variants: Record<string, () => unknown>,
  { rounds = 5, iterations }: { rounds?: number; iterations?: number } = {},
) {
  const runners = Object.values(variants)
  if (!runners.length) {
    throw new RangeError('Provide at least one benchmark variant.')
  }
  const count = iterations ?? iterationsFor(await timeOnce(runners[0]!, 3))
  const times = await measure(runners, rounds, count)
  return Object.keys(variants).map((label, i) => ({ label, ms: times[i]! }))
}
