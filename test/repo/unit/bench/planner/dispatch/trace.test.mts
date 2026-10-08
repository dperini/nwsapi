import assert from 'node:assert/strict'
import { gunzipSync } from 'node:zlib'
import { JSDOM } from 'jsdom'
import { test, vi } from 'vitest'
import { invokeMainModule, missingMainArguments } from '../../main-module.mts'
const state = vi.hoisted(() => ({
  exists: false,
  error: undefined as Error | undefined,
  status: 0,
  hash: 'hash',
  mismatch: 0,
  writes: vi.fn(),
  calls: vi.fn(),
  close: vi.fn(),
  pageClose: vi.fn(),
}))
vi.mock('../../../../../../scripts/repo/browser.mts', () => ({
  browserLaunchOptions: () => ({}),
}))
vi.mock('node:fs', () => ({
  existsSync: () => state.exists,
  mkdirSync: vi.fn(),
  writeFileSync: state.writes,
  readFileSync: (file: string) =>
    file.endsWith('evaluation.json')
      ? JSON.stringify({ results: { chromium: { modelSha256: state.hash } } })
      : 'build',
}))
vi.mock('node:child_process', () => ({
  spawnSync: (...args: unknown[]) => {
    state.calls(...args)
    return {
      error: state.error,
      status: state.status,
      stdout: 'output',
      stderr: 'ignored\nselectBulkHas dispatched\nbailout\n',
    }
  },
}))
vi.mock('../../../../../../scripts/repo/bench/footprint/shared.mts', () => ({
  provenance: () => ({ revision: 'fixture' }),
  sha256: () => 'hash',
}))
vi.mock(
  '../../../../../../scripts/repo/bench/planner/has/variants.mts',
  () => ({ baselinePath: () => '/baseline' }),
)
vi.mock(
  '../../../../../../scripts/repo/bench/planner/dispatch/variants.mts',
  () => ({ dispatchBundle: () => 'model' }),
)
vi.mock(
  '../../../../../../scripts/repo/bench/planner/dispatch/specialize.mts',
  () => ({ splitDispatchBundle: () => 'split' }),
)
vi.mock(
  '../../../../../../scripts/repo/bench/planner/dispatch/crossed.mts',
  () => ({
    crossedFixtures: () => [
      { id: 'crossed-7-192-4-0', html: '<p></p><p></p>', selector: 'p' },
    ],
  }),
)
vi.mock(
  '../../../../../../scripts/repo/bench/planner/dispatch/diagnostic.mts',
  () => ({
    diagnosticFixtures: () => [
      { id: 'diagnostic', html: '<p></p>', selector: 'p' },
    ],
  }),
)
vi.mock('@playwright/test', () => ({
  chromium: {
    launch: async () => ({
      close: state.close,
      newPage: async () => ({
        close: state.pageClose,
        setContent: vi.fn(),
        addScriptTag: vi.fn(),
        evaluate: async (
          callback: (args: unknown) => unknown,
          args: unknown,
        ) => {
          const dom = new JSDOM('<body></body>')
          vi.stubGlobal('document', dom.window.document)
          vi.stubGlobal('factory', () => ({
            select: (selector: string, doc: Document) => {
              const nodes = Array.from(doc.querySelectorAll(selector))
              return state.mismatch === 1
                ? []
                : state.mismatch === 2
                  ? nodes.toReversed()
                  : nodes
            },
          }))
          try {
            return callback(args)
          } finally {
            dom.window.close()
            vi.unstubAllGlobals()
          }
        },
      }),
    }),
  },
}))
async function load() {
  return import('../../../../../../scripts/repo/bench/planner/dispatch/trace.mts')
}

test('trace archives logs, filters routing diagnostics and records isolated or mixed capture scope', async () => {
  const { trace } = await load()
  for (let index = 0, length = 2; index < length; index += 1) {
    state.writes.mockClear()
    trace('/model', '/output', !!index)
    assert.equal(
      gunzipSync(state.writes.mock.calls[1]![1]).toString(),
      'ignored\nselectBulkHas dispatched\nbailout\n',
    )
    assert.equal(
      state.writes.mock.calls[2]![1],
      'selectBulkHas dispatched\nbailout\n',
    )
    const experiment = JSON.parse(state.writes.mock.calls[3]![1])
    assert.equal(experiment.callsPerFixture, index ? 2000 : 60_000)
    assert.equal(
      state.calls.mock.calls.at(-1)![1][3],
      index ? 'capture-mixed' : 'capture',
    )
  }
  state.exists = true
  assert.throws(() => trace('/model', '/out'), { code: 'ERR_ASSERTION' })
  state.exists = false
  state.error = Object.assign(new Error(), { code: 'SPAWN_FAILED' })
  assert.throws(() => trace('/model', '/out'), { code: 'ERR_ASSERTION' })
  state.error = undefined
  state.status = 1
  assert.throws(() => trace('/model', '/out'), { code: 'ERR_ASSERTION' })
  state.status = 0
})

test('capture evaluates browser identities and always releases resources on invalid results', async () => {
  await invokeMainModule(load, ['--help'], '/dispatch/trace.mts')
  await missingMainArguments(
    load,
    [[], ['model'], ['model', 'out', 'invalid']],
    '/dispatch/trace.mts',
  )
  await invokeMainModule(load, ['model', 'out'], '/dispatch/trace.mts')
  await invokeMainModule(load, ['model', 'out', 'mixed'], '/dispatch/trace.mts')
  vi.spyOn(console, 'log').mockImplementation(() => {})
  for (const mode of ['capture', 'capture-mixed']) {
    await invokeMainModule(load, ['model', 'out', mode], '/dispatch/trace.mts')
  }
  assert.ok(state.pageClose.mock.calls.length >= 6)
  for (const mismatch of [1, 2]) {
    state.mismatch = mismatch
    await assert.rejects(
      invokeMainModule(
        load,
        ['model', 'out', 'capture'],
        '/dispatch/trace.mts',
      ),
    )
  }
  state.mismatch = 0
  state.hash = 'different'
  await assert.rejects(
    invokeMainModule(load, ['model', 'out', 'capture'], '/dispatch/trace.mts'),
    { code: 'ERR_ASSERTION' },
  )
  state.hash = 'hash'
  assert.ok(state.close.mock.calls.length >= 4)
})
