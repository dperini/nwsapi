import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { gzipSync } from 'node:zlib'
import os from 'node:os'
import path from 'node:path'
import type * as NodeFs from 'node:fs'
const fs = await vi.importActual<typeof NodeFs>('node:fs')
const state = vi.hoisted(() => ({
  root: '',
  exists: false,
  main: false,
  hashMismatch: false,
  parityMismatch: false,
  badInput: false,
  badBaseline: false,
  costs: [4, 3, 2],
  write: vi.fn(),
  measure: vi.fn(),
  settings: { rounds: 0, milliseconds: 0 },
}))
vi.mock('node:fs', () => ({
  existsSync: () => state.exists,
  mkdirSync: vi.fn(),
  writeFileSync: state.write,
  readFileSync: (file: string) => {
    if (file.endsWith('evaluation.json')) {
      return JSON.stringify({
        artifactSha256: {
          chromium: 'hash',
          jsdom: state.hashMismatch ? 'wrong' : 'hash',
        },
      })
    }
    if (file.endsWith('parity-reference.json')) {
      return JSON.stringify([
        { features: [1, 2, 3, 4, 5, 0, 0], switch: !state.parityMismatch },
        { features: [1, 2, 3, 4, 5, 1, 1], switch: true },
      ])
    }
    if (file.endsWith('experiment.json')) {
      return file.startsWith(state.root)
        ? JSON.stringify({
            provenance: {
              inputs: [
                {
                  file: 'recorded.json',
                  sha256: state.badInput ? 'wrong' : 'hash',
                },
              ],
            },
          })
        : JSON.stringify({
            prefix: 4,
            candidateSha256: state.badBaseline ? 'wrong' : 'hash',
          })
    }
    if (file.endsWith('fixtures.json.gz')) {
      return gzipSync(JSON.stringify([{ id: 'one' }, { id: 'two' }]))
    }
    return 'export function adaptiveChoice(){return true}'
  },
}))
vi.mock('../../../../../../scripts/repo/lib/run-node.mts', () => ({
  isMainModule: (url: string) =>
    state.main && url.endsWith('/adaptive/confirm.mts'),
}))
vi.mock('../../../../../../scripts/repo/bench/footprint/shared.mts', () => ({
  provenance: () => ({ jsdom: 'fixture' }),
  sha256: () => 'hash',
}))
vi.mock(
  '../../../../../../scripts/repo/bench/planner/has/variants.mts',
  () => ({ baselinePath: () => '/fixture/baseline' }),
)
vi.mock('../../../../../../scripts/repo/bench/planner/has/power.mts', () => ({
  checkedPower: () => 'AC',
}))
vi.mock('../../../../../../scripts/repo/bench/planner/measure.mts', () => ({
  settings: state.settings,
  measureBrowser: async (...args: unknown[]) => ({
    rows: await state.measure(...args),
    version: 'fixture',
  }),
  measureJsdom: state.measure,
}))
vi.mock(
  '../../../../../../scripts/repo/bench/planner/adaptive/variants.mts',
  () => ({ adaptiveBundle: () => 'bundle' }),
)
const argv = process.argv.slice()
beforeEach(() => {
  vi.resetModules()
  state.root = fs.mkdtempSync(path.join(os.tmpdir(), 'nwsapi-adaptive-test-'))
  fs.writeFileSync(
    path.join(state.root, 'chromium.mjs'),
    'export function adaptiveChoice(){return true}',
  )
  fs.writeFileSync(
    path.join(state.root, 'jsdom.mjs'),
    'export function adaptiveChoice(){return true}',
  )
  state.exists = false
  state.main = false
  state.hashMismatch = false
  state.parityMismatch = false
  state.badInput = false
  state.badBaseline = false
  state.costs = [4, 3, 2]
  state.write.mockClear()
  state.measure
    .mockReset()
    .mockImplementation(async (entries: Array<{ id: string }>) =>
      entries.map(entry => ({ id: entry.id, costs: state.costs })),
    )
  vi.spyOn(console, 'log').mockImplementation(() => {})
})
afterEach(() => {
  process.argv = argv
  fs.rmSync(state.root, { recursive: true, force: true })
  vi.restoreAllMocks()
})
async function module() {
  return import('../../../../../../scripts/repo/bench/planner/adaptive/confirm.mts')
}
test.each([false, true])(
  'confirms validated parity and frozen measurements repeat %s',
  async repeat => {
    await (
      await module()
    ).confirmAdaptive('/fixture/input', state.root, '/fixture/output', repeat)
    const parity = state.write.mock.calls.find(([file]) =>
      file.endsWith('parity.json'),
    )!
    expect(JSON.parse(parity[1])).toEqual({
      cases: 2,
      decisionDisagreements: 0,
    })
    const reports = state.write.mock.calls.filter(
      ([file]) =>
        file.endsWith('/chromium.json') || file.endsWith('/jsdom.json'),
    )
    expect(reports).toHaveLength(2)
    expect(
      JSON.parse(reports[0]![1]).rows.map((row: { id: string }) => row.id),
    ).toEqual(repeat ? ['two', 'one'] : ['one', 'two'])
    expect(JSON.parse(reports[0]![1]).summary.passesGate).toBe(true)
    expect(state.settings.milliseconds).toBe(repeat ? 24 : 20)
  },
)
test.each(['exists', 'input', 'baseline', 'hash', 'parity'])(
  'rejects invalid confirmation %s',
  async mode => {
    state.exists = mode === 'exists'
    state.badInput = mode === 'input'
    state.badBaseline = mode === 'baseline'
    state.hashMismatch = mode === 'hash'
    state.parityMismatch = mode === 'parity'
    await expect(
      (await module()).confirmAdaptive(
        '/fixture/input',
        state.root,
        '/fixture/output',
        false,
      ),
    ).rejects.toBeInstanceOf(Error)
    expect(state.measure).not.toHaveBeenCalled()
  },
)
test('retains failing slow cases in gate summary', async () => {
  state.costs = [1.01, 2, 1]
  await (
    await module()
  ).confirmAdaptive('/fixture/input', state.root, '/fixture/output', false)
  const report = state.write.mock.calls.find(([file]) =>
    file.endsWith('/chromium.json'),
  )!
  expect(JSON.parse(report[1]).summary.passesGate).toBe(false)
})
test.each([
  { args: ['--help'], fails: false },
  { args: [], fails: true },
  { args: ['input', 'model', 'output', 'wrong'], fails: true },
  { args: ['/fixture/input'], fails: false },
  { args: ['/fixture/input', 'repeat'], fails: false },
])('handles CLI %j', async ({ args, fails }) => {
  state.main = true
  const values =
    args[0] === '/fixture/input'
      ? ['/fixture/input', state.root, '/fixture/output', ...args.slice(1)]
      : args
  process.argv = [argv[0]!, 'confirm.mts', ...values]
  if (fails) {
    await expect(module()).rejects.toBeInstanceOf(Error)
  } else {
    await module()
  }
})
