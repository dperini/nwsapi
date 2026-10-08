import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { runInNewContext } from 'node:vm'
import { JSDOM } from 'jsdom'
import type { NwsapiEngine } from '../../../../.config/runtime.d.ts'
import { scanCases, selectorsFor } from './workload.mts'

type Factory = (window: Window) => NwsapiEngine
interface Cache {
  get(key: string): unknown
  size(): number
  bytes(): number
}

const [bundle, name, mode, settings] = process.argv.slice(2)
const spec = scanCases.find(item => item.name === name)
if (!bundle || !spec || !global.gc) {
  throw new Error(
    'Usage: node --expose-gc worker.mts <bundle> <case> <timing|counts> [settings JSON]',
  )
}
let compilations = 0
let factory: Factory
if (mode === 'counts') {
  const module = { exports: {} }
  const countingFunction = new Proxy(Function, {
    apply(target, receiver, args) {
      ++compilations
      return Reflect.apply(target, receiver, args)
    },
    construct(target, args) {
      ++compilations
      return Reflect.construct(target, args)
    },
  })
  runInNewContext(readFileSync(bundle, 'utf8'), {
    module,
    exports: module.exports,
    Function: countingFunction,
  })
  factory = module.exports as Factory
} else {
  factory = createRequire(import.meta.url)(bundle) as Factory
}
const { window } = new JSDOM('<p class="c0 changed0"></p>')
const engine = factory(window as unknown as Window)
if (settings) {
  engine.configure(JSON.parse(settings))
}
const element = window.document.querySelector('p')!
const warmup = selectorsFor(spec, -1)
const passes = Array.from({ length: spec.passes }, (_, pass) =>
  selectorsFor(spec, pass),
)
const cache = engine.matchResolvers as unknown as Cache
const caches = [
  engine.matchResolvers,
  engine.matchLambdas,
] as unknown as Cache[]
let lookups = 0
let hits = 0
let hotHits = 0
let hotLookups = 0
if (mode === 'counts') {
  const get = cache.get.bind(cache)
  cache.get = key => {
    const result = get(key)
    ++lookups
    hits += Number(result !== undefined)
    if (/^\.c\d+$/.test(key)) {
      ++hotLookups
      hotHits += Number(result !== undefined)
    }
    return result
  }
}
Reflect.set(globalThis, 'cacheScanKeepAlive', {
  engine,
  window,
  warmup,
  passes,
})
global.gc()
global.gc()
const heapBefore = process.memoryUsage().heapUsed
for (const selector of warmup) {
  engine.match(selector, element)
}
compilations = lookups = hits = hotHits = hotLookups = 0
const perPass = []
let matches = 0
let calls = 0
const start = performance.now()
for (const selectors of passes) {
  const previousHits = hits
  for (const selector of selectors) {
    const result = engine.match(selector, element)
    if (mode === 'counts') {
      assert.equal(result, selector === '.c0' || selector === '.changed0')
      for (const retained of caches) {
        assert.ok(retained.size() <= (engine.Config.CACHE_LIMIT ?? 4096))
        assert.ok(
          retained.bytes() <= (engine.Config.CACHE_BYTES ?? 2 * 1024 * 1024),
        )
      }
    }
    matches += Number(result)
    ++calls
  }
  perPass.push({ calls: selectors.length, hits: hits - previousHits })
}
const milliseconds = performance.now() - start
global.gc()
global.gc()
const heapAfter = process.memoryUsage().heapUsed
console.log(
  JSON.stringify({
    name,
    mode,
    calls,
    matches,
    milliseconds,
    compilations: mode === 'counts' ? compilations : undefined,
    lookups,
    hits,
    hotHits,
    hotLookups,
    perPass: mode === 'counts' && spec.passes <= 20 ? perPass : undefined,
    heapBeforeBytes: heapBefore,
    heapAfterBytes: heapAfter,
    heapDeltaBytes: heapAfter - heapBefore,
    retained: caches.map(item => ({
      entries: item.size(),
      estimatedBytes: item.bytes(),
    })),
  }),
)
window.close()
