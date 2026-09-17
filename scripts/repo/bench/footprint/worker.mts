import { setImmediate } from 'node:timers/promises'
import { JSDOM } from 'jsdom'
import factory from '../../../../dist/nwsapi.js'
import {
  require as competitorRequire,
  positiveInteger,
  sha256,
} from './shared.mts'

export const fixture =
  '<!doctype html><main>' +
  Array.from(
    { length: 50 },
    (_, i) =>
      `<div class="item" data-i="${i}"><span class="label">Item ${i}</span></div>`,
  ).join('') +
  '</main>'

// Importing an engine happens once per process; shared module code and jsdom
// documents are already resident before the baseline reading.
interface SelectorEngine {
  querySelectorAll(selector: string, context: Document): Element[]
}
const { DOMSelector } = competitorRequire('@asamuzakjp/dom-selector') as {
  DOMSelector: new (
    window: JSDOM['window'],
    document: Document,
  ) => SelectorEngine
}

async function heap() {
  for (let pass = 0; pass < 4; pass++) {
    await setImmediate()
    globalThis.gc!()
  }
  return process.memoryUsage().heapUsed
}

async function measure(engine: string, count: number, queries: number) {
  const documents = Array.from({ length: count }, () => new JSDOM(fixture))
  const retained: unknown[] = Array.from({ length: count })
  const selectors = Array.from(
    { length: queries },
    (_, i) => `.item[data-i="${i % 50}"]:not(.absent${i}) > .label`,
  )
  const all: Array<(selector: string) => ArrayLike<Element>> = []
  try {
    // Populate the same DOM traversal caches for both contestants.
    const expected = documents.map(dom =>
      Array.from(dom.window.document.getElementsByClassName('label')),
    )
    const before = await heap()
    for (let i = 0; i < count; i++) {
      const { window } = documents[i]!
      if (engine === 'nwsapi') {
        const instance = factory(window)
        retained[i] = instance
        all.push(selector => instance.select(selector, window.document))
      } else {
        const instance = new DOMSelector(window, window.document)
        retained[i] = instance
        all.push(selector =>
          instance.querySelectorAll(selector, window.document),
        )
      }
    }
    const initialized = await heap()
    for (let i = 0; i < count; i++) {
      for (let q = 0; q < selectors.length; q++) {
        const found = all[i]!(selectors[q]!)
        if (found.length !== 1 || found[0] !== expected[i]![q % 50]) {
          throw new Error(`Incorrect result from ${engine}: ${selectors[q]}`)
        }
      }
    }
    const queried = await heap()
    // Explicitly consume retained objects after the reading.
    if (retained.some(instance => !instance) || all.length !== count) {
      throw new Error('Lost measurement roots.')
    }
    return {
      initialized: (initialized - before) / count,
      queried: (queried - before) / count,
      cacheGrowth: (queried - initialized) / count,
      fixtureSha256: sha256(fixture),
    }
  } finally {
    for (const dom of documents) {
      dom.window.close()
    }
  }
}

const [engine, rawCount = '40', rawQueries = '100'] = process.argv.slice(2)
if (!globalThis.gc || !['nwsapi', 'dom-selector'].includes(engine ?? '')) {
  throw new Error('Use the compare:memory runner with --expose-gc.')
}
const count = positiveInteger(rawCount, 'count', 1000)
const queries = positiveInteger(rawQueries, 'queries')
// Warm both allocation and query paths; discard this run before measuring.
await measure(engine!, 2, queries)
await heap()
console.log(JSON.stringify(await measure(engine!, count, queries)))
