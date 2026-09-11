import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { Session } from 'node:inspector/promises'
import { createRequire } from 'node:module'
import os from 'node:os'
import path from 'node:path'
import { parseArgs } from 'node:util'
import { resolveSamplingInterval } from './allocation-profile/options.mts'
import { positiveInteger } from '../lib/positive-integer.mts'
import type factoryType from '../../../dist/nwsapi.js'

if (process.argv.includes('--help') || process.argv.includes('-h')) {
  console.log(`Usage: node scripts/repo/bench/allocation-profile.mts [options]
--engine <path>               Engine module to measure (default: dist/nwsapi.js).
--output <directory>          Result directory (default: new directory under os.tmpdir()).
--iterations <count>          Measured iterations, 1 through 1000000 (default: 100000).
--sampling-interval <bytes>   Heap sampling interval, 1 through 32768 (default: 512 bytes).
--interval <bytes>            Existing alias. Do not combine with --sampling-interval.
Requires a current dist build. A smaller sampling interval increases profiling overhead.
-h, --help displays this help without creating output or starting a profile.`)
  process.exit(0)
}

const { values } = parseArgs({
  options: {
    engine: { type: 'string' },
    output: { type: 'string' },
    iterations: { type: 'string', default: '100000' },
    interval: { type: 'string' },
    'sampling-interval': { type: 'string' },
  },
})
const iterations = positiveInteger(values.iterations, 'iterations', 1_000_000)
const samplingInterval = resolveSamplingInterval(
  values['sampling-interval'],
  values.interval,
)
const enginePath = values.engine
  ? path.resolve(values.engine)
  : new URL('../../../dist/nwsapi.js', import.meta.url)
const output = values.output
  ? path.resolve(values.output)
  : mkdtempSync(path.join(os.tmpdir(), 'nwsapi-allocations-'))
mkdirSync(output, { recursive: true })
const [{ JSDOM }, { default: factory }] = await Promise.all([
  import('jsdom'),
  import('../../../dist/nwsapi.js'),
])
const make: typeof factoryType = values.engine
  ? createRequire(import.meta.url)(path.resolve(values.engine))
  : factory
const dom = new JSDOM('<i class="item"></i>')
const session = new Session()
session.connect()
try {
  const engine = make(dom.window)
  const selectors = Array.from(
    { length: 100 },
    (_, i) => `.item:not(.absent${i})`,
  )
  const resolvers = selectors.map(selector => engine.compile(selector, false))
  const run = (count: number) => {
    for (let i = 0; i < count; i++) {
      const index = i % selectors.length
      if (engine.compile(selectors[index]!, false) !== resolvers[index]) {
        throw new Error('Expected the cached resolver')
      }
    }
  }
  run(10_000)
  await session.post('HeapProfiler.enable')
  await session.post('HeapProfiler.collectGarbage')
  const sampling = {
    samplingInterval,
    includeObjectsCollectedByMajorGC: true,
    includeObjectsCollectedByMinorGC: true,
  }
  await session.post('HeapProfiler.startSampling', sampling)
  run(iterations)
  // Include discarded objects in the sample, not just survivors at stop time.
  await session.post('HeapProfiler.collectGarbage')
  const { profile } = await session.post('HeapProfiler.stopSampling')
  type ProfileNode = typeof profile.head
  let sampledBytes = 0
  let compilerSampledBytes = 0
  function visit(node: ProfileNode, inCompiler = false) {
    const compiler = inCompiler || node.callFrame.functionName === 'compile'
    sampledBytes += node.selfSize
    if (compiler) {
      compilerSampledBytes += node.selfSize
    }
    for (const child of node.children) {
      visit(child, compiler)
    }
  }
  visit(profile.head)
  writeFileSync(
    path.join(output, 'allocations.heapprofile'),
    JSON.stringify(profile),
  )
  const summary = {
    output,
    node: process.version,
    iterations,
    sampling,
    workload:
      'Repeated compiler cache hits across 100 warmed matching selectors',
    engineSha256: createHash('sha256')
      .update(readFileSync(enginePath))
      .digest('hex'),
    sampledBytes,
    compilerSampledBytes,
    compilerBytesPerCall: compilerSampledBytes / iterations,
  }
  writeFileSync(
    path.join(output, 'summary.json'),
    JSON.stringify(summary, null, 2),
  )
  console.log(JSON.stringify(summary, null, 2))
} finally {
  dom.window.close()
  session.disconnect()
}
