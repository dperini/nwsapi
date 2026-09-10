import type EngineFactory from '../../../dist/nwsapi.js'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { parseArgs } from 'node:util'
import { JSDOM } from 'jsdom'
import { median } from './timing.mts'

const { values } = parseArgs({
  options: {
    baseline: { type: 'string' },
    candidate: { type: 'string', default: 'dist/nwsapi.js' },
    output: { type: 'string', default: 'assets/repo/bench/first-id.json' },
  },
})
assert(values.baseline, 'Pass --baseline <previous engine build>')
const require = createRequire(import.meta.url)
const files = [values.baseline, values.candidate].map(file =>
  path.resolve(file),
)
const factories = files.map(file => require(file) as typeof EngineFactory)
const rounds = 7
const iterations = 1000
const coldIterations = 30
const rows = []
for (const rootKind of ['document', 'shadow', 'element']) {
  const { window } = new JSDOM('<!doctype html><main></main>')
  try {
    const main = window.document.querySelector('main')!
    const root =
      rootKind === 'shadow'
        ? main.attachShadow({ mode: 'open' })
        : rootKind === 'element'
          ? main
          : window.document
    const container = root === window.document ? main : root
    container.append(
      ...JSDOM.fragment(
        '<p></p>'.repeat(2000) + '<b id="target" class="target"></b>',
      ).childNodes,
    )
    const engines = factories.map(factory => factory(window))
    for (const selector of [
      '#target',
      '#missing',
      '[id="target"]',
      '[id="target"]:not(p)',
      '.target',
      'b.target',
    ]) {
      const expected = root.querySelector(selector)
      const warm: number[][] = [[], []]
      const cold: number[][] = [[], []]
      const correct = engines.map(
        engine => engine.first(selector, root) === expected,
      )
      assert(correct[1], `Candidate must match: ${rootKind}: ${selector}`)
      for (let round = 0; round < rounds; ++round) {
        for (let offset = 0; offset < engines.length; ++offset) {
          const index = (round + offset) % engines.length
          if (!correct[index]) {
            continue
          }
          const engine = engines[index]!
          let result
          const start = performance.now()
          for (let i = 0; i < iterations; ++i) {
            result = engine.first(selector, root)
          }
          warm[index]!.push((performance.now() - start) / iterations)
          assert.equal(result, expected)
          let elapsed = 0
          for (let i = 0; i < coldIterations; ++i) {
            const fresh = factories[index]!(window)
            const coldStart = performance.now()
            result = fresh.first(selector, root)
            elapsed += performance.now() - coldStart
            assert.equal(result, expected)
          }
          cold[index]!.push(elapsed / coldIterations)
        }
      }
      rows.push({
        root: rootKind,
        selector,
        correct,
        warm: warm.map(samples => ({
          samplesMs: samples,
          medianMs: samples.length ? median(samples) : null,
        })),
        cold: cold.map(samples => ({
          samplesMs: samples,
          medianMs: samples.length ? median(samples) : null,
        })),
      })
    }
  } finally {
    window.close()
  }
}
const report = {
  runtime: process.version,
  platform: process.platform,
  architecture: process.arch,
  engines: files.map(file => ({
    sha256: createHash('sha256').update(readFileSync(file)).digest('hex'),
  })),
  methodology:
    'Baseline then candidate columns. Alternate engine order over seven rounds. Warm batches use 1000 queries. Cold batches average 30 fresh engine instances with construction outside the timer. Every result is checked. Each root contains 2000 preceding elements and one target. These are direct-engine measurements, not host workload timings.',
  rows,
}
writeFileSync(values.output, JSON.stringify(report, null, 2) + '\n')
console.log(`Wrote ${values.output}`)
