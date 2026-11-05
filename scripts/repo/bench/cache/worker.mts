import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { runInNewContext } from 'node:vm'
import { JSDOM } from 'jsdom'
import { cacheCases, selectorsFor, warmupFor } from './workload.mts'

interface Cache {
  get(key: string): unknown
  size(): number
  bytes(): number
}

interface Engine {
  configure(settings: { CACHE_LIMIT: number; CACHE_BYTES: number }): void
  match(selector: string, element: Element): boolean
  matchResolvers: Cache
  matchLambdas: Cache
  Config: { CACHE_LIMIT: number; CACHE_BYTES: number }
}

type Factory = (window: Window) => Engine
const [source, caseName, mode, settingsJson] = process.argv.slice(2)
const spec = cacheCases.find(item => item.name === caseName)
if (
  !source ||
  !spec ||
  !['timing', 'counts', 'validate'].includes(mode ?? '')
) {
  throw new Error(
    'Usage: worker.mts <source.js> <case> <timing|counts|validate>',
  )
}

const dom = new JSDOM('<p class="c0 changed0"></p>')
let compilations = 0
const factory = loadFactory(source, mode === 'counts')
const engine = factory(dom.window as unknown as Window)
const settings = settingsJson ? JSON.parse(settingsJson) : spec.settings
if (settings) {
  engine.configure(settings)
}
const element = dom.window.document.querySelector('p')!
const cache = engine.matchResolvers as Cache
const boundedCaches = [engine.matchResolvers, engine.matchLambdas] as Cache[]
const limit = engine.Config.CACHE_LIMIT
const byteLimit = engine.Config.CACHE_BYTES
let lookups = 0
let hits = 0
let hotLookups = 0
let hotHits = 0
let queryLookups = 0
let queryHits = 0
let hotQueryLookups = 0
let hotQueryHits = 0
let queryLookupSeen = false
let currentHotQuery = false
const originalGet = cache.get.bind(cache)
if (mode === 'counts') {
  cache.get = key => {
    const value = originalGet(key)
    ++lookups
    hits += Number(value !== undefined)
    if (!queryLookupSeen) {
      queryLookupSeen = true
      ++queryLookups
      queryHits += Number(value !== undefined)
      if (currentHotQuery) {
        ++hotQueryLookups
        hotQueryHits += Number(value !== undefined)
      }
    }
    if (currentHotQuery) {
      ++hotLookups
      hotHits += Number(value !== undefined)
    }
    return value
  }
}

try {
  for (const selector of warmupFor(spec)) {
    engine.match(selector, element)
  }
  lookups = hits = hotLookups = hotHits = compilations = 0
  queryLookups = queryHits = hotQueryLookups = hotQueryHits = 0
  const passes = Array.from({ length: spec.passes }, (_, pass) =>
    selectorsFor(spec, pass),
  )
  if (mode === 'validate') {
    validateResults(engine, element, passes)
    console.log(JSON.stringify({ case: caseName, valid: true }))
  } else {
    let calls = 0
    let matches = 0
    const start = performance.now()
    for (const selectors of passes) {
      for (const selector of selectors) {
        queryLookupSeen = false
        currentHotQuery = /^\.c\d+$/.test(selector)
        const result = engine.match(selector, element)
        if (mode === 'counts') {
          assert.equal(result, expectedResult(selector))
        }
        matches += Number(result)
        ++calls
        if (mode === 'counts') {
          assertBounds(boundedCaches, limit, byteLimit)
        }
      }
    }
    const milliseconds = performance.now() - start
    assert.equal(matches, expectedMatches(passes))
    console.log(
      JSON.stringify({
        case: caseName,
        mode,
        calls,
        matches,
        milliseconds,
        lookups,
        hits,
        hotLookups,
        hotHits,
        queryLookups,
        queryHits,
        hotQueryLookups,
        hotQueryHits,
        compilations: mode === 'counts' ? compilations : undefined,
        retained: boundedCaches.map(item => ({
          entries: item.size(),
          estimatedBytes: item.bytes(),
        })),
      }),
    )
  }
} finally {
  dom.window.close()
}

function assertBounds(caches: Cache[], entryLimit: number, maxBytes: number) {
  for (const item of caches) {
    assert.ok(item.size() <= entryLimit, 'cache exceeded its entry limit')
    assert.ok(item.bytes() <= maxBytes, 'cache exceeded its byte limit')
  }
}

function loadFactory(source: string, countCompilations: boolean): Factory {
  if (!countCompilations) {
    return createRequire(import.meta.url)(source) as Factory
  }
  const module = { exports: {} }
  const CountingFunction = new Proxy(Function, {
    apply(target, receiver, args) {
      ++compilations
      return Reflect.apply(target, receiver, args)
    },
    construct(target, args) {
      ++compilations
      return Reflect.construct(target, args)
    },
  })
  runInNewContext(readFileSync(source, 'utf8'), {
    module,
    exports: module.exports,
    Function: CountingFunction,
  })
  return module.exports as Factory
}

function validateResults(engine: Engine, element: Element, passes: string[][]) {
  for (const selectors of passes) {
    for (const selector of selectors) {
      assert.equal(engine.match(selector, element), expectedResult(selector))
    }
  }
}

function expectedResult(selector: string): boolean {
  return selector === '.c0' || selector === '.changed0'
}

function expectedMatches(passes: string[][]): number {
  let matches = 0
  for (const selectors of passes) {
    for (const selector of selectors) {
      matches += Number(expectedResult(selector))
    }
  }
  return matches
}
