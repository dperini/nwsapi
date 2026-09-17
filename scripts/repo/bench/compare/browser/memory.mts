import type { CDPSession, Page } from '@playwright/test'
import type { BrowserHost } from './timing.mts'

export async function profileBrowserMemory(page: Page, session: CDPSession) {
  const heap = async () => {
    for (let i = 0; i < 4; ++i) {
      await page.evaluate(() => new Promise(resolve => setTimeout(resolve, 0)))
      await session.send('HeapProfiler.collectGarbage')
    }
    return (await session.send('Runtime.getHeapUsage')).usedSize
  }
  const invoke = (index: number) =>
    page.evaluate(i => {
      const query = (window as unknown as BrowserHost).queries[i]!
      for (let call = 0; call < 2000; ++call) {
        query()
      }
    }, index)
  const rows = []
  for (let round = 0; round < 3; ++round) {
    for (let offset = 0; offset < 2; ++offset) {
      const index = (round + offset) % 2
      const before = await heap()
      await invoke(index)
      const after = await heap()
      await invoke(index)
      const afterRepeat = await heap()
      await session.send('HeapProfiler.startSampling', {
        samplingInterval: 1024,
        includeObjectsCollectedByMajorGC: true,
        includeObjectsCollectedByMinorGC: true,
      })
      await invoke(index)
      const { profile } = await session.send('HeapProfiler.stopSampling')
      const sites = new Map<string, number>()
      const sum = (node: typeof profile.head): number => {
        const frame = node.callFrame
        const site = `${frame.functionName || '(anonymous)'} ${frame.url}:${frame.lineNumber + 1}`
        sites.set(site, (sites.get(site) ?? 0) + node.selfSize)
        return (
          node.selfSize +
          node.children.reduce((total, child) => total + sum(child), 0)
        )
      }
      const allocatedBytesEstimate = sum(profile.head)
      rows.push({
        round,
        name: index ? 'candidate' : 'baseline',
        heapBefore: before,
        heapAfter: after,
        heapAfterRepeat: afterRepeat,
        allocatedBytesEstimate,
        allocationSites: Array.from(sites, ([site, bytes]) => ({ site, bytes }))
          .toSorted((a, b) => b.bytes - a.bytes)
          .slice(0, 10),
      })
    }
  }
  return rows
}
