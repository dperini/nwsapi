import { JSDOM } from 'jsdom'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
const state = vi.hoisted(() => ({
  write: vi.fn(),
  exec: vi.fn(),
  badColor: false,
  cache: {} as Record<string, { exports: unknown }>,
  windows: [] as Array<{ close(): void }>,
}))
vi.mock('node:fs', () => ({
  readFileSync: () => Buffer.from('engine'),
  writeFileSync: state.write,
}))
vi.mock('node:child_process', () => ({ execFileSync: state.exec }))
class Adapter {
  readonly options: Record<string, unknown>
  constructor(
    _window: unknown,
    _document: unknown,
    options: Record<string, unknown>,
  ) {
    this.options = options
  }
  check(_selector: string, _input: unknown) {
    return true
  }
  extractSubjects(_selector: string, _sensitive?: boolean) {
    return [{ id: null, className: null, tag: null }]
  }
}
class FixtureDom {
  window: InstanceType<typeof JSDOM>['window']
  constructor(html: string) {
    const dom = new JSDOM(html)
    this.window = dom.window
    state.windows.push(dom.window)
    const Factory = (
      state.cache['adapter']!.exports as { DOMSelector: typeof Adapter }
    ).DOMSelector
    const adapter = new Factory(dom.window, dom.window.document, {
      check: () => true,
      extractSubjects: () => [],
    })
    const original = dom.window.getComputedStyle.bind(dom.window)
    dom.window.getComputedStyle = element => {
      adapter.check('.hit', element)
      adapter.extractSubjects('.hit')
      adapter.extractSubjects(':is(.hit)', true)
      if (state.badColor) {
        return { color: 'incorrect' } as CSSStyleDeclaration
      }
      return original(element)
    }
  }
}
vi.mock('node:module', () => ({
  createRequire: () => {
    const load = Object.assign(
      (file: string) => {
        if (file === 'jsdom') {
          return { JSDOM: FixtureDom }
        }
        if (file.endsWith('/package.json')) {
          return { version: 'fixture' }
        }
        if (file === 'adapter') {
          return state.cache['adapter']!.exports
        }
        return { DOMSelector: Adapter }
      },
      { resolve: () => 'adapter', cache: state.cache },
    )
    return load
  },
}))
beforeEach(() => {
  vi.resetModules()
  vi.clearAllMocks()
  state.badColor = false
  state.windows = []
  state.cache['adapter'] = { exports: { DOMSelector: Adapter } }
  state.exec.mockReturnValue(JSON.stringify({ mode: 'fixture' }))
  vi.spyOn(console, 'log').mockImplementation(() => {})
})
afterEach(() => {
  state.windows.forEach(window => window.close())
})
async function invoke(args: string[]) {
  const argv = process.argv
  process.argv = [argv[0]!, '/survey/hooks.mts', ...args]
  try {
    await import('../../../../../scripts/repo/bench/survey/hooks.mts')
  } finally {
    process.argv = argv
  }
}
test.each(['baseline', 'subjects', 'stock'])(
  'stylesheet worker probes actual styles in %s mode',
  async mode => {
    const log = vi.spyOn(console, 'log')
    await invoke(['--dependencies', '/deps', '--worker', mode])
    const report = JSON.parse(log.mock.calls[0]![0] as string)
    expect(report.mode).toBe(mode)
    expect(report.styleMilliseconds).toHaveLength(7)
    expect(report.selectorTextMutation.expected).toBe('rgb(1, 2, 3)')
    expect(report.selectorTextMutation.before).toEqual(expect.any(String))
    expect(report.selectorTextMutation.after).toEqual(expect.any(String))
    expect(report.checkCalls).toEqual(
      mode === 'stock' ? null : Array(7).fill(24),
    )
    expect(report.hostOptionKeys).toEqual(
      mode === 'stock' ? [] : ['check', 'extractSubjects'],
    )
  },
)
test('worker rejects incorrect stylesheet results', async () => {
  state.badColor = true
  await expect(
    invoke(['--dependencies', '/deps', '--worker', 'baseline']),
  ).rejects.toThrow()
})
test('parent aggregates three isolated workers with recorded provenance', async () => {
  await invoke(['--dependencies', '/deps', '--output', '/hooks.json'])
  expect(state.exec).toHaveBeenCalledTimes(3)
  const report = JSON.parse(state.write.mock.calls[0]![1] as string)
  expect(report.results).toHaveLength(3)
  expect(report.candidateSha256).toHaveLength(64)
})
test.each([
  { args: ['--help'], fails: false },
  { args: [], fails: true },
  { args: ['--dependencies', '/deps'], fails: true },
])('hooks CLI handles $args', async ({ args, fails }) => {
  if (fails) {
    await expect(invoke(args)).rejects.toThrow()
  } else {
    await invoke(args)
  }
  expect(state.exec).not.toHaveBeenCalled()
  expect(state.write).not.toHaveBeenCalled()
})
