import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test, vi } from 'vitest'

const state = vi.hoisted(() => ({
  connect: vi.fn(),
  disconnect: vi.fn(),
  post: vi.fn(async (command: string) =>
    command === 'HeapProfiler.stopSampling'
      ? {
          profile: {
            head: {
              callFrame: { functionName: 'root' },
              selfSize: 10,
              children: [
                {
                  callFrame: { functionName: 'compile' },
                  selfSize: 20,
                  children: [
                    {
                      callFrame: { functionName: 'helper' },
                      selfSize: 30,
                      children: [],
                    },
                  ],
                },
              ],
            },
          },
        }
      : {},
  ),
}))
vi.mock('node:inspector/promises', () => ({
  Session: class {
    connect = state.connect
    disconnect = state.disconnect
    post = state.post
  },
}))

test('allocation profiler accounts for compiler descendant allocations and closes the inspector on failure', async () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'nwsapi-profile-test-'))
  const source = path.join(directory, 'engine.cjs')
  writeFileSync(
    source,
    'module.exports=()=>{const cache=new Map();return{compile:s=>{if(!cache.has(s))cache.set(s,()=>{});return cache.get(s)}}}',
  )
  const original = process.argv
  const log = vi.spyOn(console, 'log').mockImplementation(() => {})
  try {
    process.argv = [
      original[0]!,
      'allocation-profile.mts',
      '--engine',
      source,
      '--output',
      directory,
      '--iterations',
      '10',
      '--sampling-interval',
      '256',
    ]
    await import('../../../../scripts/repo/bench/allocation-profile.mts')
    const report = JSON.parse(
      readFileSync(path.join(directory, 'summary.json'), 'utf8'),
    )
    assert.equal(report.sampledBytes, 60)
    assert.equal(report.compilerSampledBytes, 50)
    assert.equal(report.compilerBytesPerCall, 5)
    assert.equal(report.sampling.samplingInterval, 256)
    assert.equal(report.engineSha256.length, 64)
    assert.equal(state.disconnect.mock.calls.length, 1)
    assert.deepEqual(
      state.post.mock.calls.map(call => call[0]),
      [
        'HeapProfiler.enable',
        'HeapProfiler.collectGarbage',
        'HeapProfiler.startSampling',
        'HeapProfiler.collectGarbage',
        'HeapProfiler.stopSampling',
      ],
    )
    const broken = path.join(directory, 'broken.cjs')
    writeFileSync(broken, 'module.exports=()=>({compile:()=>()=>{}})')
    vi.resetModules()
    process.argv = [
      original[0]!,
      'allocation-profile.mts',
      '--engine',
      broken,
      '--output',
      directory,
      '--iterations',
      '1',
    ]
    await assert.rejects(
      import('../../../../scripts/repo/bench/allocation-profile.mts'),
    )
    assert.equal(state.disconnect.mock.calls.length, 2)
    vi.resetModules()
    process.argv = [original[0]!, 'allocation-profile.mts', '--iterations', '1']
    await import('../../../../scripts/repo/bench/allocation-profile.mts')
    const defaults = JSON.parse(log.mock.calls.at(-1)![0] as string)
    assert.equal(defaults.sampling.samplingInterval, 512)
    assert.equal(defaults.iterations, 1)
    rmSync(defaults.output, { recursive: true, force: true })
    vi.spyOn(process, 'exit').mockImplementation(() => {
      throw Object.assign(new Error('exit'), { code: 'FIXTURE_EXIT' })
    })
    const options = ['--help', '-h']
    for (let index = 0, length = options.length; index < length; index += 1) {
      vi.resetModules()
      process.argv = [original[0]!, 'allocation-profile.mts', options[index]!]
      await assert.rejects(
        import('../../../../scripts/repo/bench/allocation-profile.mts'),
        { code: 'FIXTURE_EXIT' },
      )
    }
  } finally {
    process.argv = original
    vi.resetModules()
    rmSync(directory, { recursive: true, force: true })
  }
})
