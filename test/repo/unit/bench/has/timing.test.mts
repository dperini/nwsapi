import { afterEach, beforeEach, expect, test, vi } from 'vitest'
const state = vi.hoisted(() => ({
  write: vi.fn(),
  mismatch: false,
  empty: false,
  disconnect: vi.fn(),
}))
vi.mock('node:fs', () => ({
  readFileSync: () => Buffer.from('fixture'),
  writeFileSync: state.write,
}))
vi.mock('node:module', () => ({
  createRequire: () => (file: string) =>
    file.endsWith('package.json')
      ? { version: 'fixture' }
      : () => {
          const cache = new Map<string, Element[]>()
          const select = (selector: string, doc: Document) => {
            if (!cache.has(selector)) {
              cache.set(selector, Array.from(doc.querySelectorAll(selector)))
            }
            return state.mismatch ? [doc.body] : cache.get(selector)!
          }
          return {
            select,
            first: (selector: string, doc: Document) =>
              select(selector, doc)[0] || null,
          }
        },
}))
vi.mock('node:inspector/promises', () => ({
  Session: class {
    connect() {}
    disconnect() {
      state.disconnect()
    }
    async post(command: string) {
      return command === 'Profiler.stop'
        ? {
            profile: {
              nodes: [
                {
                  id: 1,
                  callFrame: {
                    functionName: '',
                    url: '/fixture/a.js',
                    lineNumber: 0,
                  },
                },
                {
                  id: 2,
                  callFrame: {
                    functionName: 'select',
                    url: '/fixture/b.js',
                    lineNumber: 1,
                  },
                },
              ],
              ...(state.empty ? {} : { samples: [1, 1, 2] }),
            },
          }
        : {}
    }
  },
}))
vi.mock('../../../../../scripts/repo/bench/timing.mts', () => ({
  median: (values: number[]) => values[0],
}))
const argv = process.argv.slice()
beforeEach(() => {
  vi.resetModules()
  state.write.mockClear()
  state.disconnect.mockClear()
  state.mismatch = false
  state.empty = false
  process.argv = [argv[0]!, 'timing.mts', '--baseline', '/fixture/baseline']
  vi.spyOn(console, 'log').mockImplementation(() => {})
})
afterEach(() => {
  process.argv = argv
  vi.restoreAllMocks()
})
async function run() {
  await import('../../../../../scripts/repo/bench/has/timing.mts')
}
test.each(['none', 'present', 'empty'])(
  'records real ordered existence queries and profile %s',
  async profile => {
    if (profile !== 'none') {
      process.argv.push('--profile')
      state.empty = profile === 'empty'
    }
    await run()
    const report = JSON.parse(state.write.mock.calls[0]![1])
    expect(report.rows).toHaveLength(18)
    expect(
      report.rows.every((row: { warm: Array<{ samplesMs: number[] }> }) =>
        row.warm.every(values => values.samplesMs.length === 5),
      ),
    ).toBe(true)
    expect(
      report.rows.some((row: { matches: number }) => row.matches === 0),
    ).toBe(true)
    expect(report.profiles).toHaveLength(profile === 'none' ? 0 : 2)
    if (profile !== 'none') {
      expect(report.profiles[0].sampleCount).toBe(profile === 'empty' ? 0 : 3)
    }
  },
)
test('rejects incorrect ordered results', async () => {
  state.mismatch = true
  await expect(run()).rejects.toMatchObject({ code: 'ERR_ASSERTION' })
})
test('requires baseline', async () => {
  process.argv = [argv[0]!, 'timing.mts']
  await expect(run()).rejects.toMatchObject({ code: 'ERR_ASSERTION' })
})
