import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import type { MockInstance } from 'vitest'
import { JSDOM } from 'jsdom'
const state = vi.hoisted(() => ({
  compare: vi.fn(),
  windows: [] as Array<{ close: () => void }>,
}))
let exit: MockInstance
vi.mock('../../../../scripts/repo/bench/documents.mts', () => ({
  DOCUMENTS: {
    documentation: {
      html: () =>
        '<div class="example"><a href="#" id="title" class="example"></a><span class="examplex example"></span><a id="no"></a></div>',
      note: 'fixture',
    },
  },
}))
vi.mock('../../../../scripts/repo/bench/timing.mts', () => ({
  compare: state.compare,
}))
vi.mock('../../../../scripts/repo/bench/world.mts', () => ({
  world: (html: string) => {
    const dom = new JSDOM(html)
    state.windows.push(dom.window)
    return {
      document: dom.window.document,
      all: (selector: string) =>
        Array.from(dom.window.document.querySelectorAll(selector)),
    }
  },
}))
beforeEach(() => {
  vi.resetModules()
  vi.clearAllMocks()
  state.compare.mockImplementation(
    async (variants: Record<string, () => unknown>) =>
      Object.entries(variants).map(([label, callback], index) => {
        callback()
        return { label, ms: index + 1 }
      }),
  )
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
  exit = vi.spyOn(process, 'exit').mockImplementation(() => {
    throw Object.assign(new Error('exit'), { code: 'ERR_TEST_EXIT' })
  })
})
afterEach(() => {
  state.windows.forEach(window => window.close())
  state.windows.length = 0
})
async function invoke(args: string[]) {
  const argv = process.argv
  process.argv = [argv[0]!, '/accessors.bench.mts', ...args]
  try {
    return await import('../../../../scripts/repo/bench/accessors.bench.mts')
  } finally {
    process.argv = argv
  }
}
test.each([false, true])(
  'all host reads and alternatives are executed markdown=%s',
  async markdown => {
    await invoke(
      markdown
        ? ['--markdown', '--rounds', '1', '--doc', 'documentation']
        : ['--'],
    )
    expect(state.compare).toHaveBeenCalledTimes(21)
  },
)
test('class helpers handle token boundaries and non-string host properties', async () => {
  const module = await invoke([])
  expect(module.scanClass('', 'example')).toBe(false)
  expect(module.scanClass('example', 'example')).toBe(true)
  expect(module.scanClass('examples example', 'example')).toBe(true)
  expect(module.scanClass('xexample examplex', 'example')).toBe(false)
  expect(module.scanClass('prefix example suffix', 'example')).toBe(true)
  const dom = new JSDOM('<svg class="example"></svg>')
  state.windows.push(dom.window)
  expect(module.classOf(dom.window.document.querySelector('svg')!)).toBe(
    'example',
  )
})
test.each([
  { args: ['--help'], code: 0 },
  { args: ['--doc', 'unknown'], code: 1 },
])('CLI exits with requested status %#', async ({ args, code }) => {
  await expect(invoke(args)).rejects.toMatchObject({ code: 'ERR_TEST_EXIT' })
  expect(state.compare).not.toHaveBeenCalled()
  expect(exit.mock.calls[0]?.[0]).toBe(code)
})
