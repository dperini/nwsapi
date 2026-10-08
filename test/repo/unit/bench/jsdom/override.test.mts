import { JSDOM } from 'jsdom'
import { beforeEach, expect, test, vi } from 'vitest'
const state = vi.hoisted(() => ({
  write: vi.fn(),
  remove: vi.fn(),
  exec: vi.fn(),
  pack: vi.fn(),
  compare: vi.fn(),
  generate: vi.fn(),
  close: vi.fn(),
  mode: '',
  after: false,
}))
vi.mock('node:fs', () => ({
  mkdirSync: () => {},
  mkdtempSync: () => '/benchmark',
  rmSync: state.remove,
  writeFileSync: state.write,
  readFileSync: (file: string) => {
    if (!file.endsWith('/package.json')) {
      return Buffer.from('asset')
    }
    const override = file.includes('/override/')
    return JSON.stringify({
      name:
        state.mode === 'name'
          ? 'wrong'
          : override
            ? 'nwsapi'
            : '@asamuzakjp/dom-selector',
      version: state.mode === 'version' ? 'wrong' : override ? '3' : '6',
    })
  },
}))
vi.mock('node:child_process', () => ({ execFileSync: state.exec }))
function installation(comparison: boolean) {
  return class extends JSDOM {
    constructor(html: string) {
      super(html)
      const close = this.window.close.bind(this.window)
      this.window.close = () => {
        state.close()
        close()
      }
      const query = this.window.document.querySelectorAll.bind(
        this.window.document,
      )
      this.window.document.querySelectorAll = ((selector: string) => {
        const nodes = query(selector)
        return comparison &&
          (state.mode === 'order' || (state.mode === 'changed' && state.after))
          ? Array.from(nodes).toReversed()
          : nodes
      }) as typeof this.window.document.querySelectorAll
    }
  }
}
vi.mock('node:module', () => ({
  createRequire: (location: string) => {
    const comparison = location.includes('/comparison/')
    const installed =
      location.includes('/comparison/') || location.includes('/override/')
    const directory = comparison
      ? '/benchmark/comparison'
      : '/benchmark/override'
    return Object.assign(
      (file: string) =>
        file === 'jsdom'
          ? { JSDOM: installation(comparison) }
          : {
              version:
                file === 'jsdom/package.json' &&
                installed &&
                state.mode === 'jsdom'
                  ? 'wrong'
                  : file === 'jsdom/package.json'
                    ? '30'
                    : '3',
            },
      {
        resolve: (file: string) =>
          file === 'jsdom'
            ? directory + '/node_modules/jsdom/lib/api.js'
            : directory + '/selector/dist/index.js',
      },
    )
  },
}))
vi.mock('../../../../../scripts/repo/build/package.mts', () => ({
  packPackage: state.pack,
}))
vi.mock('../../../../../scripts/repo/bench/cases.mts', () => ({
  cases: {
    components: { basic: ['.item', '.missing'] },
    documentation: { basic: ['.item'] },
    atomic: { basic: ['.item'] },
  },
}))
vi.mock('../../../../../scripts/repo/bench/documents.mts', () => ({
  DOCUMENTS: {
    components: { html: () => '<i class="item"></i><i class="item"></i>' },
    documentation: { html: () => '<i class="item"></i><i class="item"></i>' },
    atomic: { html: () => '<i class="item"></i><i class="item"></i>' },
  },
}))
vi.mock('../../../../../scripts/repo/bench/compare/timing.mts', () => ({
  compareTiming: state.compare,
}))
vi.mock('../../../../../scripts/repo/bench/footprint/shared.mts', async () => {
  const { createHash } = await import('node:crypto')
  return {
    provenance: () => ({ candidateVersion: '3', competitorVersion: '6' }),
    sha256: (input: string | Buffer) =>
      createHash('sha256').update(input).digest('hex'),
  }
})
vi.mock('../../../../../scripts/repo/gen/jsdom-benchmark.mts', () => ({
  writeJsdomBenchmark: state.generate,
}))
beforeEach(() => {
  vi.resetModules()
  vi.clearAllMocks()
  state.mode = ''
  state.after = false
  state.pack.mockResolvedValue({ filename: 'package.tgz' })
  state.compare.mockImplementation(async (queries: Array<() => unknown>) => {
    queries.forEach(query => query())
    state.after = true
    return queries.map(() =>
      Array.from({ length: 9 }, () => ({ p50Ns: 100, samplesNs: [100] })),
    )
  })
  vi.spyOn(console, 'log').mockImplementation(() => {})
})
async function invoke(args: string[] = []) {
  const argv = process.argv
  process.argv = [argv[0]!, '/jsdom/override.mts', ...args]
  try {
    await import('../../../../../scripts/repo/bench/jsdom/override.mts')
  } finally {
    process.argv = argv
  }
}
test('isolated jsdom override installs pinned consumers and verifies ordered identities', async () => {
  await invoke()
  expect(state.exec).toHaveBeenCalledTimes(2)
  expect(
    state.exec.mock.calls.every(
      call => call[0] === 'npm' && call[1].includes('--ignore-scripts'),
    ),
  ).toBe(true)
  const packages = state.write.mock.calls
    .filter(call => (call[0] as string).endsWith('/package.json'))
    .map(call => JSON.parse(call[1] as string))
  expect(packages[0].overrides['@asamuzakjp/dom-selector']).toBe(
    'file:/benchmark/package.tgz',
  )
  expect(packages[1].overrides['@asamuzakjp/dom-selector']).toBe('6')
  const report = JSON.parse(
    state.write.mock.calls.find(
      call => call[0] === 'assets/repo/bench/jsdom-override.json',
    )![1] as string,
  )
  expect(report.rows).toHaveLength(4)
  expect(
    report.metadata.installations.map(
      (item: { selector: string }) => item.selector,
    ),
  ).toEqual(['nwsapi', '@asamuzakjp/dom-selector'])
  expect(state.close).toHaveBeenCalledTimes(6)
  expect(state.remove).toHaveBeenCalledOnce()
  expect(state.generate).toHaveBeenCalledOnce()
})
test.each(['name', 'version', 'jsdom', 'order', 'changed'])(
  'invalid %s installation or query output cleans temporary files',
  async mode => {
    state.mode = mode
    await expect(invoke()).rejects.toMatchObject({ code: 'ERR_ASSERTION' })
    expect(state.remove).toHaveBeenCalledOnce()
    expect(state.generate).not.toHaveBeenCalled()
  },
)
test('package build failure cleans its temporary directory', async () => {
  state.pack.mockRejectedValue(new Error('pack failed'))
  await expect(invoke()).rejects.toThrow()
  expect(state.remove).toHaveBeenCalledOnce()
  expect(state.exec).not.toHaveBeenCalled()
})
test.each(['--help', '-h'])(
  'help %s exits before package preparation',
  async flag => {
    vi.spyOn(process, 'exit').mockImplementation(() => {
      throw Object.assign(new Error(), { code: 'TEST_EXIT' })
    })
    await expect(invoke([flag])).rejects.toMatchObject({ code: 'TEST_EXIT' })
    expect(state.pack).not.toHaveBeenCalled()
  },
)
