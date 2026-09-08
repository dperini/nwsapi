import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { Session } from 'node:inspector/promises'
import path from 'node:path'
import os from 'node:os'
import { parseArgs } from 'node:util'
import { createHash } from 'node:crypto'
import { writeHeapSnapshot } from 'node:v8'
import { JSDOM } from 'jsdom'
import factory from '../../../src/nwsapi.js'

const { values } = parseArgs({
  options: {
    output: { type: 'string' },
    engine: { type: 'string' },
    count: { type: 'string', default: '100' },
    queries: { type: 'string', default: '200' },
    method: { type: 'string', default: 'select' },
  },
})
if (values.method !== 'select' && values.method !== 'match') {
  throw new Error('method must be select or match')
}
const count = Number(values.count)
const queries = Number(values.queries)
if (
  !Number.isInteger(count) ||
  count < 1 ||
  count > 200 ||
  !Number.isInteger(queries) ||
  queries < 1 ||
  queries > 1000
) {
  throw new Error(
    'count must be an integer from 1 to 200; queries must be an integer from 1 to 1000',
  )
}
const enginePath = values.engine
  ? path.resolve(values.engine)
  : new URL('../../../src/nwsapi.js', import.meta.url)
const make: typeof factory = values.engine
  ? createRequire(import.meta.url)(path.resolve(values.engine))
  : factory
const output = values.output
  ? path.resolve(values.output)
  : mkdtempSync(path.join(os.tmpdir(), 'nwsapi-heap-'))
mkdirSync(output, { recursive: true })
const session = new Session()
session.connect()
await session.post('HeapProfiler.enable')
const dom = new JSDOM('<main><i class="item"></i></main>')
const target = dom.window.document.querySelector('.item')!
const engines: Array<ReturnType<typeof factory>> = []
const measurements: Record<string, number> = {}
async function capture(name: string) {
  for (let pass = 0; pass < 4; pass++) {
    await new Promise(resolve => setTimeout(resolve, 0))
    await session.post('HeapProfiler.collectGarbage')
  }
  measurements[name] = process.memoryUsage().heapUsed
  writeHeapSnapshot(path.join(output, `${name}.heapsnapshot`))
}
try {
  // Warm the DOM and factory before measuring retained engine instances.
  make(dom.window).select('.item', dom.window.document)
  await capture('baseline')
  for (let index = 0; index < count; index++) {
    engines.push(make(dom.window))
  }
  await capture('instances')
  await session.post('HeapProfiler.startSampling', { samplingInterval: 1024 })
  for (const engine of engines) {
    for (let index = 0; index < queries; index++) {
      const selector = `.item:not(.absent${index})`
      if (values.method === 'match') {
        if (!engine.match(selector, target)) {
          throw new Error('Incorrect profiling match result')
        }
      } else if (engine.select(selector, dom.window.document).length !== 1) {
        throw new Error('Incorrect profiling select result')
      }
    }
  }
  const { profile } = await session.post('HeapProfiler.stopSampling')
  writeFileSync(
    path.join(output, 'allocations.heapprofile'),
    JSON.stringify(profile),
  )
  await capture('cached')
  const detached = (() => {
    const host = dom.window.document.createElement('section')
    host.innerHTML = '<i class="leaf"></i>'.repeat(2000)
    dom.window.document.body.append(host)
    const references = [...host.children].map(node => new WeakRef(node))
    engines[0]!.select('.leaf', host)
    engines[0]!.first('.leaf', host)
    host.remove()
    // Return the active context to the live document, as subsequent queries do.
    engines[0]!.select('body', dom.window.document)
    return references
  })()
  await capture('detached')
  const retainedDetachedNodes = detached.filter(reference =>
    reference.deref(),
  ).length
  engines.length = 0
  await capture('released')
  const summary = {
    output,
    count,
    queries,
    method: values.method,
    node: process.version,
    measurements,
    retainedDetachedNodes,
    engineSha256: createHash('sha256')
      .update(readFileSync(enginePath))
      .digest('hex'),
    bytesPerInstance:
      (measurements['instances']! - measurements['baseline']!) / count,
    bytesPerCachedSelector:
      (measurements['cached']! - measurements['instances']!) /
      (count * queries),
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
