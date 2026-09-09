import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { JSDOM } from 'jsdom'
import type factory from '../../../dist/nwsapi.js'
import { profileAncestorMemory } from './ancestor-memory.mts'
import { median } from './timing.mts'

const { values } = parseArgs({
  options: {
    baseline: { type: 'string' },
    memory: { type: 'boolean', default: false },
    output: { type: 'string' },
  },
})
if (!values.output) {
  throw new Error(
    'Use --output <report.json> [--baseline engine.cjs] [--memory]',
  )
}
const paths = values.baseline
  ? [values.baseline, 'dist/nwsapi.js']
  : ['dist/nwsapi.js']
const names = values.baseline ? ['baseline', 'candidate'] : ['current']
const make = paths.map(
  p => createRequire(import.meta.url)(resolve(p)) as typeof factory,
)
const rows = []
for (const matches of [0, 1, 16, 256]) {
  const { window } = new JSDOM(
    '<!doctype html><body>' +
      Array.from(
        { length: 256 },
        (_, i) =>
          '<p class="' + (i < matches ? 'hit g' + (i % 4) : '') + '"></p>',
      ).join(''),
  )
  try {
    const doc = window.document
    const engines = make.map(create => create(window))
    for (const selector of ['.hit', '.g0,.g1,.g2,.g3']) {
      const expected = Array.from(doc.querySelectorAll(selector))
      assert.equal(expected.length, matches)
      const query = (index: number) => engines[index]!.select(selector, doc)
      const check = (index: number) => {
        const result = query(index)
        assert.equal(result.length, matches)
        for (let i = 0; i < matches; ++i) {
          assert.equal(result[i], expected[i])
        }
      }
      for (let i = 0; i < engines.length; ++i) {
        check(i)
        for (let warmup = 0; warmup < 1000; ++warmup) {
          query(i)
        }
      }
      const samples = engines.map(() => [] as number[])
      for (let round = 0; round < 9; ++round) {
        for (let offset = 0; offset < engines.length; ++offset) {
          const index = (round + offset) % engines.length
          const start = performance.now()
          let calls = 0
          do {
            for (let i = 0; i < 1000; ++i) {
              query(index)
            }
            calls += 1000
          } while (performance.now() - start < 50)
          samples[index]!.push((performance.now() - start) / calls)
          check(index)
        }
      }
      rows.push({
        matches,
        selector,
        variants: names.map((name, i) => ({
          name,
          medianMs: median(samples[i]!),
          samplesMs: samples[i],
        })),
        memory: values.memory
          ? await profileAncestorMemory(query, names)
          : undefined,
      })
    }
  } finally {
    window.close()
  }
}
writeFileSync(
  values.output,
  JSON.stringify(
    {
      node: process.version,
      hashes: paths.map(p =>
        createHash('sha256').update(readFileSync(p)).digest('hex'),
      ),
      methodology:
        'Warm public select calls on 256-element jsdom fixtures with 0, 1, 16, or 256 matches. Single-class control and four disjoint selector groups return the same ordered nodes. Nine rotating timing rounds run for at least 50ms in batches of 1000 calls after 1000 warmups. Optional allocation profiling uses three rotating rounds of 2000 calls, includes collected objects, and records retained heap separately. Setup and compilation are outside timing and allocation samples. Use a separate process without --memory for timing conclusions.',
      rows,
    },
    null,
    2,
  ) + '\n',
)
console.log(`Wrote ${values.output}`)
