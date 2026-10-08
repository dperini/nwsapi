import type * as Fs from 'node:fs'
import type * as Module from 'node:module'
import { beforeEach, expect, test, vi } from 'vitest'
const state = vi.hoisted(() => ({
  write: vi.fn(),
  remove: vi.fn(),
  compare: vi.fn(),
  badShape: false,
}))
// This archived experiment requires the former direct-getter compiler shape.
// Keep that contract in the fixture while exercising real wrapper identities.
const legacy = `function attr(v,name){return v + '.getAttribute("' + name + '")'}`
vi.mock('node:module', async () => {
  const actual = await vi.importActual<typeof Module>('node:module')
  return {
    createRequire: (url: string) => {
      const load = actual.createRequire(url)
      return Object.assign(
        (file: string) => {
          if (file === 'jsdom/lib/generated/idl/utils.js') {
            return load(file)
          }
          if (file.endsWith('/package.json')) {
            return { version: 'fixture' }
          }
          return () => {
            const Snapshot = {
              attrOf: (node: Element, name: string) => node.getAttribute(name),
            }
            return {
              Snapshot,
              select: (selector: string, context: Document | Element) => {
                Array.from(context.querySelectorAll('[data-testid]')).forEach(
                  node => Snapshot.attrOf(node, 'data-testid'),
                )
                return Array.from(context.querySelectorAll(selector))
              },
            }
          }
        },
        { cache: {} },
      )
    },
  }
})
vi.mock('node:fs', async () => {
  const actual = await vi.importActual<typeof Fs>('node:fs')
  return {
    ...actual,
    readFileSync: (...args: Parameters<typeof actual.readFileSync>) =>
      args[0] === 'dist/nwsapi.js'
        ? state.badShape
          ? 'missing'
          : legacy
        : actual.readFileSync(...args),
    writeFileSync: (...args: Parameters<typeof actual.writeFileSync>) =>
      typeof args[0] === 'string' && args[0].endsWith('/candidate.cjs')
        ? actual.writeFileSync(...args)
        : state.write(...args),
    rmSync: (...args: Parameters<typeof actual.rmSync>) => {
      state.remove(...args)
      return actual.rmSync(...args)
    },
  }
})
vi.mock('../../../../scripts/repo/bench/documents.mts', () => ({
  components: () =>
    '<main id="root"><button data-testid="btn-150"></button><input data-testid="input"></main>',
}))
vi.mock('../../../../scripts/repo/bench/compare/timing.mts', () => ({
  compareTiming: state.compare,
}))
beforeEach(() => {
  vi.resetModules()
  vi.clearAllMocks()
  state.badShape = false
  state.compare.mockImplementation(async (queries: Array<() => unknown>) =>
    queries.map(query => {
      query()
      return [{ p50Ns: 100, samplesNs: [100] }]
    }),
  )
  vi.spyOn(console, 'log').mockImplementation(() => {})
})
async function invoke(args: string[]) {
  const argv = process.argv
  process.argv = [argv[0]!, '/internal-attribute-reader.mts', ...args]
  try {
    await import('../../../../scripts/repo/bench/internal-attribute-reader.mts')
  } finally {
    process.argv = argv
  }
}
test.each([false, true])(
  'internal attribute benchmark validates wrappers and mutations explicitOutput=%s',
  async explicit => {
    await invoke(explicit ? ['/report'] : [])
    const report = JSON.parse(state.write.mock.calls[0]![1] as string)
    expect(report.rows).toHaveLength(6)
    expect(
      report.rows.map((row: { scope: string; mutate: boolean }) => [
        row.scope,
        row.mutate,
      ]),
    ).toEqual([
      ['document', false],
      ['document', true],
      ['document', false],
      ['document', true],
      ['element', false],
      ['element', true],
    ])
    expect(report.hashes[0]).not.toBe(report.hashes[1])
    expect(state.compare).toHaveBeenCalledTimes(6)
    expect(state.remove).toHaveBeenCalledOnce()
  },
)
test('attribute timing errors remove the temporary candidate bundle', async () => {
  state.compare.mockRejectedValue(new Error('timing failed'))
  await expect(invoke([])).rejects.toThrow()
  expect(state.remove).toHaveBeenCalledOnce()
  expect(state.write).not.toHaveBeenCalled()
})
test('unexpected attribute compiler shapes fail before benchmark setup', async () => {
  state.badShape = true
  await expect(invoke([])).rejects.toThrow()
  expect(state.compare).not.toHaveBeenCalled()
  expect(state.remove).not.toHaveBeenCalled()
})
