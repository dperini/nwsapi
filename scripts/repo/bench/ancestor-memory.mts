import { Session } from 'node:inspector/promises'
import { setImmediate } from 'node:timers/promises'

// Keep profiler work outside query timing. Collected objects must be included
// because query-local weak maps should disappear before a retained-heap reading.
export async function profileAncestorMemory(
  query: (index: number) => unknown,
  names = ['baseline', 'always-cache', 'depth-gated'],
) {
  const session = new Session()
  session.connect()
  const heap = async () => {
    for (let i = 0; i < 4; ++i) {
      await setImmediate()
      await session.post('HeapProfiler.collectGarbage')
    }
    return process.memoryUsage().heapUsed
  }
  const rows = []
  try {
    for (let round = 0; round < 3; ++round) {
      for (let offset = 0; offset < 3; ++offset) {
        const index = (round + offset) % 3
        const before = await heap()
        for (let i = 0; i < 2000; ++i) {
          query(index)
        }
        const after = await heap()
        for (let i = 0; i < 2000; ++i) {
          query(index)
        }
        const afterRepeat = await heap()
        await session.post('HeapProfiler.startSampling', {
          samplingInterval: 1024,
          includeObjectsCollectedByMajorGC: true,
          includeObjectsCollectedByMinorGC: true,
        })
        for (let i = 0; i < 2000; ++i) {
          query(index)
        }
        const { profile } = await session.post('HeapProfiler.stopSampling')
        const sites = new Map<string, number>()
        const total = (node: typeof profile.head): number => {
          const { functionName, url, lineNumber } = node.callFrame
          const key = `${functionName || '(anonymous)'} ${url}:${lineNumber + 1}`
          sites.set(key, (sites.get(key) ?? 0) + node.selfSize)
          return (
            node.selfSize +
            node.children.reduce((sum, child) => sum + total(child), 0)
          )
        }
        const allocatedBytesEstimate = total(profile.head)
        rows.push({
          round,
          name: names[index],
          allocatedBytesEstimate,
          heapBefore: before,
          heapAfter: after,
          heapAfterRepeat: afterRepeat,
          allocationSites: Array.from(sites, ([site, bytes]) => ({
            site,
            bytes,
          }))
            .toSorted((a, b) => b.bytes - a.bytes)
            .slice(0, 10),
        })
      }
    }
    return rows
  } finally {
    session.disconnect()
  }
}
