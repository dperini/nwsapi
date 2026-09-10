import { createRequire } from 'node:module'
import { getHeapStatistics } from 'node:v8'
import { JSDOM } from 'jsdom'
import type factory from '../../../../dist/nwsapi.js'
import { profileAncestorMemory } from '../ancestor-memory.mts'
import { fixture, selectors, checkResults } from './fixture.mts'
import { options, metadata, writeReport } from './options.mts'
import { compareTiming } from './timing.mts'

const config = options()
if (config.mode === 'memory' && !global.gc) {
  throw new Error('Memory mode requires node --expose-gc')
}
const require = createRequire(import.meta.url)
const make = config.paths.map(p => require(p) as typeof factory)
const rows = []
for (const matches of config.counts) {
  const { window } = new JSDOM(
    fixture(matches, config.groups, config.layout, config.scenario),
  )
  try {
    const doc = window.document
    const engines = make.map(create => create(window))
    for (const selector of selectors(config.groups, config.scenario)) {
      const expected = Array.from(doc.querySelectorAll(selector))
      if (expected.length !== matches) {
        throw new Error('Fixture returned an unexpected match count')
      }
      const queries = engines.map(engine => () => engine.select(selector, doc))
      for (const query of queries) {
        checkResults(query(), expected)
        for (let i = 0; i < 1000; ++i) {
          query()
        }
      }
      const measurements = await compareTiming(
        queries,
        config.settings,
        config.mode === 'memory'
          ? {
              gc: () => global.gc!(),
              read: () => getHeapStatistics().used_heap_size,
            }
          : undefined,
      )
      const memory =
        config.mode === 'memory'
          ? await profileAncestorMemory(
              i => queries[i]!(),
              ['baseline', 'candidate'],
            )
          : undefined
      for (const query of queries) {
        checkResults(query(), expected)
      }
      rows.push({ matches, selector, measurements, memory })
      console.log(`${config.scenario}: ${matches} matches, ${selector}`)
    }
  } finally {
    window.close()
  }
}
writeReport(config.output, {
  ...metadata(config),
  node: process.version,
  jsdom: require('jsdom/package.json').version,
  heapProvider:
    config.mode === 'memory' ? 'v8.getHeapStatistics().used_heap_size' : null,
  rows,
})
