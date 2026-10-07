import assert from 'node:assert/strict'
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test, vi } from 'vitest'
const state = vi.hoisted(() => ({
  samples: undefined as number[] | undefined,
  root: '',
  connect: vi.fn(),
  disconnect: vi.fn(),
}))
vi.mock('node:inspector/promises', () => ({
  Session: class {
    connect = state.connect
    disconnect = state.disconnect
    async post() {
      return {
        profile: {
          samples: state.samples,
          nodes: [
            {
              hitCount: 2,
              callFrame: {
                functionName: 'compile',
                url: state.root + '/engine.js',
                lineNumber: 1,
              },
            },
            {
              hitCount: 1,
              callFrame: {
                functionName: 'helper',
                url: state.root + '/engine.js',
                lineNumber: 2,
              },
            },
            {
              hitCount: 0,
              callFrame: { functionName: 'idle', url: '', lineNumber: 0 },
            },
          ],
        },
      }
    }
  },
}))

test('bounded CPU profiler separates warmup, samples and timings and verifies ordered fixtures', async () => {
  const directory = mkdtempSync(
    path.join(os.tmpdir(), 'nwsapi-bounded-profile-'),
  )
  state.root = directory
  mkdirSync(path.join(directory, 'dist'))
  const engine = path.join(directory, 'dist/nwsapi.js')
  const output = path.join(directory, 'report.json')
  writeFileSync(
    engine,
    'module.exports=()=>{const cache=new Map();return{select:(selector,document)=>{if(!cache.has(selector))cache.set(selector,Array.from(document.querySelectorAll(selector)));return cache.get(selector)}}}',
  )
  const original = process.argv
  vi.spyOn(process, 'cwd').mockReturnValue(directory)
  vi.spyOn(console, 'log').mockImplementation(() => {})
  const load = async (file?: string) => {
    vi.resetModules()
    process.argv = [
      original[0]!,
      'bounded-profile.mts',
      output,
      ...(file ? [file] : []),
    ]
    await import('../../../../../scripts/repo/bench/compare/bounded-profile.mts')
  }
  try {
    await load(engine)
    const report = JSON.parse(readFileSync(output, 'utf8'))
    assert.equal(report.engineHash.length, 64)
    assert.equal(report.rows.length, 11)
    assert.equal(report.rows[0].millisecondsPerQuery.length, 5)
    assert.deepEqual(report.rows[0].sites, [
      { function: 'compile', file: '<repo>/engine.js', line: 2, percent: 200 },
      { function: 'helper', file: '<repo>/engine.js', line: 3, percent: 100 },
    ])
    state.samples = [1, 2]
    await load()
    const second = JSON.parse(readFileSync(output, 'utf8'))
    assert.equal(second.rows[0].sites[0].percent, 100)
    state.samples = []
    await load(engine)
    const bad = [
      'module.exports=()=>({select:()=>[]})',
      'module.exports=()=>({select:(s,d)=>Array.from(d.querySelectorAll(s),node=>node.cloneNode())})',
    ]
    for (let index = 0, length = bad.length; index < length; index += 1) {
      const file = path.join(directory, `bad${index}.cjs`)
      writeFileSync(file, bad[index]!)
      await assert.rejects(load(file))
    }
    assert.equal(state.disconnect.mock.calls.length, 5)
  } finally {
    process.argv = original
    vi.resetModules()
    rmSync(directory, { recursive: true, force: true })
  }
})
