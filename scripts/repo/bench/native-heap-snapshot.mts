import { createHash } from 'node:crypto'
import {
  closeSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readFileSync,
  writeFileSync,
  writeSync,
} from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { parseArgs } from 'node:util'
import type factory from '../../../dist/nwsapi.js'
import { ENGINE_BUILD_PATH } from '../lib/paths.mts'
import { positiveInteger } from './footprint-shared.mts'

type Engine = ReturnType<typeof factory>
interface HeapHost {
  __make: typeof factory
  __frames: HTMLIFrameElement[]
  __engines: Engine[]
  __weakEngines: Array<WeakRef<Engine>>
  __weakDocuments: Array<WeakRef<Document>>
  __weakNodes: Array<WeakRef<Element>>
}

if (process.argv.includes('--help') || process.argv.includes('-h')) {
  console.log(`Usage: pnpm run bench:memory-browser-profile [options]
--engine <path>          Browser engine build to measure (default: dist/nwsapi.js).
--output-dir <directory> Result directory (default: new directory under os.tmpdir()).
--count <number>         Retained documents and engines, 1 through 200 (default: 40).
--queries <number>       Cached selectors per engine, 1 through 1000 (default: 100).
-h, --help displays this help without loading Playwright or opening Chrome.`)
  process.exit(0)
}

const { values } = parseArgs({
  options: {
    engine: { type: 'string' },
    'output-dir': { type: 'string' },
    count: { type: 'string', default: '40' },
    queries: { type: 'string', default: '100' },
  },
})
const count = positiveInteger(values.count, 'count', 200)
const queries = positiveInteger(values.queries, 'queries', 1000)
const source = readFileSync(
  values.engine ? path.resolve(values.engine) : ENGINE_BUILD_PATH,
  'utf8',
)
const output = values['output-dir']
  ? path.resolve(values['output-dir'])
  : mkdtempSync(path.join(os.tmpdir(), 'nwsapi-native-heap-'))
mkdirSync(output, { recursive: true })
const [{ chromium }, { browserLaunchOptions }] = await Promise.all([
  import('@playwright/test'),
  import('../browser.mts'),
])
const browser = await chromium.launch(browserLaunchOptions())
try {
  const page = await browser.newPage()
  await page.addScriptTag({
    content: `(function(){const module={exports:{}};const exports=module.exports;\n${source}\nglobalThis.__make=module.exports;})();`,
  })
  const session = await page.context().newCDPSession(page)
  await session.send('HeapProfiler.enable')
  await session.send('Performance.enable')
  const measurements: Record<string, number> = {}
  async function capture(name: string) {
    for (let pass = 0; pass < 4; pass++) {
      await page.evaluate(() => new Promise(resolve => setTimeout(resolve, 0)))
      await session.send('HeapProfiler.collectGarbage')
    }
    const { metrics } = await session.send('Performance.getMetrics')
    const heap = metrics.find(metric => metric.name === 'JSHeapUsedSize')?.value
    if (heap === undefined) {
      throw new Error('Missing retained JS heap metric')
    }
    measurements[name] = heap
    const file = openSync(path.join(output, `${name}.heapsnapshot`), 'w')
    const onChunk = ({ chunk }: { chunk: string }) => {
      writeSync(file, chunk)
    }
    session.on('HeapProfiler.addHeapSnapshotChunk', onChunk)
    try {
      await session.send('HeapProfiler.takeHeapSnapshot')
    } finally {
      session.off('HeapProfiler.addHeapSnapshotChunk', onChunk)
      closeSync(file)
    }
  }
  await page.evaluate(documentCount => {
    const host = window as unknown as HeapHost
    host.__make(window).select('body', document)
    host.__frames = Array.from({ length: documentCount }, () => {
      const frame = document.createElement('iframe')
      document.body.append(frame)
      frame.contentDocument!.body.innerHTML =
        '<main><i class="item" data-id="0"><b class="label"></b></i></main>'
      return frame
    })
    host.__weakDocuments = host.__frames.map(
      frame => new WeakRef(frame.contentDocument!),
    )
    host.__weakNodes = []
    host.__engines = []
  }, count)
  await capture('baseline')
  await page.evaluate(() => {
    const host = window as unknown as HeapHost
    host.__engines = host.__frames.map(frame =>
      host.__make(frame.contentWindow!),
    )
    host.__weakEngines = host.__engines.map(engine => new WeakRef(engine))
  })
  await capture('instances')
  await session.send('HeapProfiler.startSampling', { samplingInterval: 1024 })
  await page.evaluate(queryCount => {
    const host = window as unknown as HeapHost
    for (let i = 0; i < host.__engines.length; i++) {
      const engine = host.__engines[i]!
      const doc = host.__frames[i]!.contentDocument!
      for (let q = 0; q < queryCount; q++) {
        const selector = `.item[data-id="0"]:not(.absent${q}) > .label`
        if (
          engine.select(selector, doc).length !== 1 ||
          !engine.first(selector, doc)
        ) {
          throw new Error('Incorrect profiling query result')
        }
      }
    }
  }, queries)
  const { profile } = await session.send('HeapProfiler.stopSampling')
  writeFileSync(
    path.join(output, 'allocations.heapprofile'),
    JSON.stringify(profile),
  )
  await capture('cached')
  await page.evaluate(() => {
    const host = window as unknown as HeapHost
    host.__engines.forEach((engine, i) => {
      const doc = host.__frames[i]!.contentDocument!
      const subtree = doc.createElement('section')
      subtree.innerHTML = '<i class="leaf"></i>'.repeat(100)
      doc.body.append(subtree)
      host.__weakNodes.push(
        ...Array.from(subtree.children, node => new WeakRef(node)),
      )
      engine.select('.leaf', subtree)
      engine.first('.leaf', subtree)
      subtree.remove()
      engine.select('body', doc)
    })
  })
  await capture('detached')
  const retainedDetachedNodes = await page.evaluate(
    () =>
      (window as unknown as HeapHost).__weakNodes.filter(ref => ref.deref())
        .length,
  )
  await page.evaluate(() => {
    ;(window as unknown as HeapHost).__engines.length = 0
  })
  await capture('released-engines')
  const retainedEngines = await page.evaluate(
    () =>
      (window as unknown as HeapHost).__weakEngines.filter(ref => ref.deref())
        .length,
  )
  await page.evaluate(() => {
    const host = window as unknown as HeapHost
    host.__frames.forEach(frame => frame.remove())
    host.__frames.length = 0
  })
  await capture('released-documents')
  const retainedDocuments = await page.evaluate(
    () =>
      (window as unknown as HeapHost).__weakDocuments.filter(ref => ref.deref())
        .length,
  )
  const summary = {
    output,
    count,
    queries,
    browser: browser.version(),
    engineSha256: createHash('sha256').update(source).digest('hex'),
    measurements,
    retainedDetachedNodes,
    retainedEngines,
    retainedDocuments,
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
  await browser.close()
}
