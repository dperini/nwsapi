import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test, vi } from 'vitest'
const state = vi.hoisted(() => ({
  connect: vi.fn(),
  disconnect: vi.fn(),
  post: vi.fn(async () => ({ profile: {} })),
  snapshot: vi.fn((file: string) => file),
}))
vi.mock('node:inspector/promises', () => ({
  Session: class {
    connect = state.connect
    disconnect = state.disconnect
    post = state.post
  },
}))
vi.mock('node:v8', () => ({ writeHeapSnapshot: state.snapshot }))

test('Node heap runner validates retained query workloads, writes snapshots and closes failed engines', async () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'nwsapi-heap-test-'))
  const engine = path.join(directory, 'engine.cjs')
  writeFileSync(
    engine,
    'module.exports=window=>({select:(s,c)=>Array.from(c.querySelectorAll(s)),match:(s,e)=>e.matches(s),first:(s,c)=>c.querySelector(s)})',
  )
  const original = process.argv
  const log = vi.spyOn(console, 'log').mockImplementation(() => {})
  let heap = 0
  vi.spyOn(process, 'memoryUsage').mockImplementation(() => ({
    rss: 0,
    heapTotal: 0,
    heapUsed: ++heap,
    external: 0,
    arrayBuffers: 0,
  }))
  const run = async (args: string[]) => {
    vi.resetModules()
    process.argv = [original[0]!, 'heap-snapshot.mts', ...args]
    await import('../../../../scripts/repo/bench/heap-snapshot.mts')
  }
  try {
    await run([
      '--engine',
      engine,
      '--output-dir',
      directory,
      '--count',
      '1',
      '--queries',
      '2',
      '--method',
      'match',
    ])
    const report = JSON.parse(
      readFileSync(path.join(directory, 'summary.json'), 'utf8'),
    )
    assert.equal(report.method, 'match')
    assert.equal(report.bytesPerInstance, 1)
    assert.equal(report.bytesPerCachedSelector, 0.5)
    assert.equal(report.engineSha256.length, 64)
    assert.equal(state.snapshot.mock.calls.length, 5)
    assert.ok(
      report.retainedDetachedNodes >= 0 && report.retainedDetachedNodes <= 2000,
    )
    await run(['--count', '1', '--queries', '1'])
    const defaults = JSON.parse(log.mock.calls.at(-1)![0] as string)
    assert.equal(defaults.method, 'select')
    rmSync(defaults.output, { recursive: true, force: true })
    const methods = ['select', 'match']
    for (let index = 0, length = methods.length; index < length; index += 1) {
      const broken = path.join(directory, `broken${index}.cjs`)
      writeFileSync(
        broken,
        'module.exports=()=>({select:()=>[],match:()=>false})',
      )
      await assert.rejects(
        run([
          '--engine',
          broken,
          '--output-dir',
          directory,
          '--count',
          '1',
          '--queries',
          '1',
          '--method',
          methods[index]!,
        ]),
      )
    }
    assert.equal(state.disconnect.mock.calls.length, 4)
    const invalid = [
      ['--method', 'invalid'],
      ['--count', '1.5'],
      ['--count', '0'],
      ['--count', '201'],
      ['--queries', '1.5'],
      ['--queries', '0'],
      ['--queries', '1001'],
    ]
    for (let index = 0, length = invalid.length; index < length; index += 1) {
      await assert.rejects(run(invalid[index]!))
    }
    vi.spyOn(process, 'exit').mockImplementation(() => {
      throw Object.assign(new Error('exit'), { code: 'FIXTURE_EXIT' })
    })
    await assert.rejects(run(['--help']), { code: 'FIXTURE_EXIT' })
    await assert.rejects(run(['-h']), { code: 'FIXTURE_EXIT' })
  } finally {
    process.argv = original
    vi.resetModules()
    rmSync(directory, { recursive: true, force: true })
  }
})
