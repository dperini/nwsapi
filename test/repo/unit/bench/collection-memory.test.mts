import { beforeEach, expect, test, vi } from 'vitest'
import type { DOMWindow } from 'jsdom'
const state = vi.hoisted(() => ({ retention: 'none' }))
vi.mock('../../../../dist/nwsapi.js', () => ({
  default: (host: DOMWindow) => {
    const observer = new host.MutationObserver(() => {})
    observer.observe(host.document.body, { childList: true, subtree: true })
    return {
      select: (selector: string, context: Document | Element) =>
        Array.from(context.querySelectorAll(selector)),
    }
  },
}))
beforeEach(() => {
  vi.resetModules()
  vi.clearAllMocks()
  state.retention = 'none'
})
async function invoke() {
  const previous = process.exitCode
  const log = vi.spyOn(console, 'log').mockImplementation(() => {})
  const gc = vi.fn()
  vi.stubGlobal('gc', gc)
  const original = Reflect.get(WeakRef.prototype, 'deref') as (
    this: WeakRef<object>,
  ) => object | undefined
  vi.spyOn(WeakRef.prototype, 'deref').mockImplementation(
    function (this: WeakRef<object>) {
      const target = Reflect.apply(original, this, []) as
        | { nodeType?: number }
        | undefined
      if (!target) {
        return undefined
      }
      return state.retention === 'nodes'
        ? target.nodeType === 1
          ? target
          : undefined
        : state.retention === 'observers'
          ? target.nodeType === undefined
            ? target
            : undefined
          : undefined
    },
  )
  try {
    await import('../../../../scripts/repo/bench/collection-memory.mts')
    return {
      report: JSON.parse(log.mock.calls[0]![0] as string),
      exitCode: process.exitCode,
      gcCalls: gc.mock.calls.length,
    }
  } finally {
    vi.unstubAllGlobals()
    process.exitCode = previous
  }
}
test.each(['none', 'nodes', 'observers'])(
  'collection ownership reports %s retention',
  async retention => {
    state.retention = retention
    const result = await invoke()
    expect(result.report.nodes).toBe(20)
    expect(result.report.observers).toBe(20)
    expect(result.report.retainedNodes).toBe(retention === 'nodes' ? 20 : 0)
    expect(result.report.retainedObservers).toBe(
      retention === 'observers' ? 20 : 0,
    )
    expect(result.gcCalls).toBe(20)
    if (retention !== 'none') {
      expect(result.exitCode).toBe(1)
    }
  },
)
test('collection ownership requires explicit garbage collection', async () => {
  vi.stubGlobal('gc', undefined)
  try {
    await expect(
      import('../../../../scripts/repo/bench/collection-memory.mts'),
    ).rejects.toThrow()
  } finally {
    vi.unstubAllGlobals()
  }
})
