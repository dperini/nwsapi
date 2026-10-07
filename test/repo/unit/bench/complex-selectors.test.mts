import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import type * as NodeFs from 'node:fs'
import { JSDOM } from 'jsdom'

const state = vi.hoisted(() => ({
  clear: true,
  emptyProfile: false,
  closed: 0,
  write: vi.fn(),
  execute: vi.fn(),
  log: vi.fn(),
  post: vi.fn(),
}))

function select(selector: string, root: Document | Element) {
  const doc = root.nodeType === 9 ? (root as Document) : root.ownerDocument!
  const boxes = Array.from(doc.body.children).filter(node =>
    node.classList.contains('box'),
  )
  return boxes.flatMap((box, index) =>
    selector.includes('nth-of-type') && !(index >= 4 && index % 4 === 0)
      ? []
      : Array.from(box.getElementsByClassName('content')),
  )
}
class Baseline {
  private cache = new Map<string, Element[]>()
  clear: (() => void) | undefined
  constructor() {
    this.clear = state.clear ? () => this.cache.clear() : undefined
  }
  querySelectorAll(selector: string, root: Document | Element) {
    if (!this.cache.has(selector)) {
      this.cache.set(selector, select(selector, root))
    }
    return this.cache.get(selector)!
  }
}
class PreparedDom {
  window: JSDOM['window']
  constructor(html: string) {
    const dom = new JSDOM(html)
    this.window = dom.window
    const doc = dom.window.document
    Object.defineProperty(doc, 'querySelectorAll', {
      value: (selector: string) => select(selector, doc),
    })
    Object.defineProperty(doc.body, 'querySelectorAll', {
      value: (selector: string) => select(selector, doc.body),
    })
    const close = dom.window.close.bind(dom.window)
    dom.window.close = () => {
      state.closed += 1
      close()
    }
  }
}

vi.mock('node:module', () => ({
  createRequire: () =>
    Object.assign(
      (specifier: string) => {
        if (specifier === './lib/api.js') {
          return { JSDOM: PreparedDom }
        }
        if (specifier.endsWith('/package.json')) {
          return { version: 'fixture' }
        }
        if (specifier.endsWith('/nwsapi.js')) {
          return () => ({ select })
        }
        return { DOMSelector: Baseline }
      },
      {
        resolve: (specifier: string) => specifier,
        cache: { '@asamuzakjp/dom-selector': { exports: {} } },
      },
    ),
}))
vi.mock('node:fs', async importOriginal => ({
  ...(await importOriginal<typeof NodeFs>()),
  readFileSync: () => Buffer.from('fixture'),
  writeFileSync: state.write,
}))
vi.mock('node:child_process', () => ({ execFileSync: state.execute }))
vi.mock('node:inspector/promises', () => ({
  Session: class {
    connect() {}
    disconnect() {}
    async post(command: string) {
      state.post(command)
      return command === 'Profiler.stop'
        ? {
            profile: {
              nodes: [
                {
                  id: 1,
                  callFrame: {
                    functionName: 'query',
                    url: '/fixture/query.mts',
                    lineNumber: 0,
                  },
                },
                {
                  id: 2,
                  callFrame: {
                    functionName: '',
                    url: '/fixture/anonymous.mts',
                    lineNumber: 1,
                  },
                },
              ],
              ...(state.emptyProfile ? {} : { samples: [1, 1, 2] }),
            },
          }
        : {}
    }
  },
}))

const originalArgs = process.argv
function args(values: string[]) {
  process.argv = ['node', 'complex-selectors.mts', ...values]
}
function rows(profile: boolean, stale: boolean) {
  const entries = [
    { shape: 'original', scope: 'document', selector: 'first' },
    { shape: 'original', scope: 'document', selector: 'second' },
    { shape: 'original', scope: 'element', selector: 'first' },
    { shape: 'wide', scope: 'document', selector: 'first' },
  ]
  return entries.map((entry, index) => ({
    ...entry,
    firstMs: 1,
    warmMs: 2,
    mutationMs: stale ? null : 3,
    mutationCorrect: !stale,
    ...(profile && index === 0
      ? { profile: [{ frame: 'fixture', samples: 2 }] }
      : {}),
  }))
}
beforeEach(() => {
  vi.resetModules()
  vi.clearAllMocks()
  state.clear = true
  state.emptyProfile = false
  state.closed = 0
  state.execute.mockImplementation((command: string, values: string[]) =>
    command === 'git'
      ? 'fixture-revision'
      : JSON.stringify(
          rows(values.includes('--profile'), values.includes('baseline')),
        ),
  )
  vi.spyOn(console, 'log').mockImplementation(state.log)
})
afterEach(() => {
  process.argv = originalArgs
})

test.each([
  ['candidate', 'direct'],
  ['baseline', 'direct'],
  ['baseline', 'host'],
  ['candidate', 'host'],
])(
  'complex %s workers preserve live DOM identity through the %s route',
  async (engine, route) => {
    args([
      '--host',
      '/fixture',
      '--engine',
      engine,
      '--route',
      route,
      ...(engine === 'baseline' && route === 'direct' ? ['--profile'] : []),
    ])
    await import('../../../../scripts/repo/bench/complex-selectors.mts')
    const measured = JSON.parse(state.log.mock.calls.at(-1)![0])
    expect(measured).toHaveLength(16)
    expect(
      measured.every(
        (row: { mutationCorrect: boolean }) => row.mutationCorrect,
      ),
    ).toBe(true)
    expect(
      new Set(measured.map((row: { shape: string }) => row.shape)).size,
    ).toBe(4)
    expect(state.closed).toBe(4)
  },
)

test('a stale baseline receives null mutation timing and empty profiles preserve their recorded shape', async () => {
  state.clear = false
  state.emptyProfile = true
  args([
    '--host',
    '/fixture',
    '--engine',
    'baseline',
    '--route',
    'direct',
    '--profile',
  ])
  await import('../../../../scripts/repo/bench/complex-selectors.mts')
  const measured = JSON.parse(state.log.mock.calls.at(-1)![0])
  expect(
    measured.every(
      (row: { mutationCorrect: boolean; mutationMs: null }) =>
        !row.mutationCorrect && row.mutationMs === null,
    ),
  ).toBe(true)
  expect(
    measured
      .filter((row: { profile?: unknown }) => row.profile)
      .every((row: { profile: unknown[] }) => row.profile.length === 0),
  ).toBe(true)
})

test('the complex controller rotates subprocess measurements and keeps invalid mutation samples out of medians', async () => {
  args(['--host', '/fixture', '--output', '/fixture/report.json'])
  await import('../../../../scripts/repo/bench/complex-selectors.mts')
  const report = JSON.parse(state.write.mock.calls[0]![1])
  expect(report.runs).toHaveLength(20)
  expect(
    report.profiles.map((item: { rows: unknown[] }) => item.rows.length),
  ).toEqual([1, 1])
  expect(
    report.summaries[0].measurements.map(
      (item: { mutationMs: number | null }) => item.mutationMs,
    ),
  ).toEqual([null, 3, null, 3])
  expect(report.candidateSha256).toMatch(/^[a-f0-9]{64}$/)
})

test('complex worker configuration rejects missing hosts and unsupported engine routes', async () => {
  const invalid = [
    [],
    ['--host', '/fixture', '--engine', 'invalid'],
    ['--host', '/fixture', '--engine', 'candidate', '--route', 'invalid'],
  ]
  for (let i = 0, length = invalid.length; i < length; i += 1) {
    vi.resetModules()
    args(invalid[i]!)
    await expect(
      import('../../../../scripts/repo/bench/complex-selectors.mts'),
    ).rejects.toMatchObject({ code: 'ERR_ASSERTION' })
  }
})
