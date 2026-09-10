import { do_not_optimize, measure } from 'mitata'

export interface Settings {
  rounds: number
  milliseconds: number
  batch: number
}
export interface HeapProvider {
  read: () => number
  gc: () => void
}

export async function compareTiming(
  queries: Array<() => unknown>,
  settings: Settings,
  heap?: HeapProvider,
) {
  const results = queries.map(
    () =>
      [] as Array<{
        round: number
        calls: number
        p50Ns: number
        p99Ns: number
        samplesNs: number[]
        heapDeltaBytes?: {
          avg: number
          min: number
          max: number
          total: number
        }
        gcNs?: { avg: number; min: number; max: number; total: number }
      }>,
  )
  try {
    for (let round = 0; round < settings.rounds; ++round) {
      for (let offset = 0; offset < queries.length; ++offset) {
        const index = (round + offset) % queries.length
        const stats = await measure(
          () => {
            let result: unknown
            for (let i = 0; i < settings.batch; ++i) {
              result = queries[index]!()
            }
            do_not_optimize(result)
          },
          {
            gc: heap ? heap.gc : false,
            ...(heap ? { heap: heap.read, inner_gc: true } : {}),
            batch_threshold: -1,
            min_samples: 12,
            max_samples: heap ? 12 : 100_000,
            min_cpu_time: heap ? 0 : settings.milliseconds * 1e6,
            samples_threshold: Infinity,
          },
        )
        const scale = (value: number) => value / settings.batch
        results[index]!.push({
          round,
          calls: stats.ticks * settings.batch,
          p50Ns: scale(stats.p50),
          p99Ns: scale(stats.p99),
          samplesNs: stats.samples.map(scale),
          ...(stats.heap
            ? {
                heapDeltaBytes: {
                  avg: scale(stats.heap.avg),
                  min: scale(stats.heap.min),
                  max: scale(stats.heap.max),
                  total: stats.heap.total,
                },
              }
            : {}),
          ...(stats.gc ? { gcNs: stats.gc } : {}),
        })
      }
    }
  } finally {
    do_not_optimize(undefined)
  }
  return results
}
