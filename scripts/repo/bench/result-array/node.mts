import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { JSDOM } from 'jsdom'
import type factory from '../../../../dist/nwsapi.js'
import { profileAncestorMemory } from '../ancestor/memory.mts'
import { median } from '../timing.mts'

const { values } = parseArgs({
  options: {
    baseline: { type: 'string' },
    layout: { type: 'string', default: 'adjacent' },
    groups: { type: 'string', default: '4' },
    memory: { type: 'boolean', default: false },
    matches: { type: 'string' },
    output: { type: 'string' },
  },
})
if (!values.output) {
  throw new Error(
    'Use --output <report.json> [--baseline engine.cjs] [--memory] [--layout adjacent|separated|nested] [--groups 4] [--matches 256]',
  )
}
const groups = Number(values.groups)
if (!Number.isInteger(groups) || groups < 2 || groups > 256) {
  throw new Error('Use --groups with an integer from 2 to 256')
}
const layout = values.layout
if (!['adjacent', 'separated', 'nested'].includes(layout)) {
  throw new Error('Use --layout adjacent, separated, or nested')
}
const paths = values.baseline
  ? [values.baseline, 'dist/nwsapi.js']
  : ['dist/nwsapi.js']
const names = values.baseline ? ['baseline', 'candidate'] : ['current']
const make = paths.map(
  p => createRequire(import.meta.url)(resolve(p)) as typeof factory,
)
const counts =
  values.matches === undefined ? [0, 1, 16, 256] : [Number(values.matches)]
if (
  counts.some(count => !Number.isInteger(count) || count < 0 || count > 256)
) {
  throw new Error('Use --matches with an integer from 0 to 256')
}
const rows = []
for (const matches of counts) {
  const { window } = new JSDOM(
    '<!doctype html><body>' +
      Array.from({ length: 256 }, (_, i) => {
        const element =
          '<p class="' + (i < matches ? 'hit g' + (i % groups) : '') + '"></p>'
        return layout === 'nested'
          ? '<section>' + element + '</section>'
          : element + (layout === 'separated' ? ' gap <!-- gap -->' : '')
      }).join(''),
  )
  try {
    const doc = window.document
    const engines = make.map(create => create(window))
    for (const selector of [
      '.hit',
      Array.from({ length: groups }, (_, i) => '.g' + i).join(','),
    ]) {
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
      layout,
      groups,
      hashes: paths.map(p =>
        createHash('sha256').update(readFileSync(p)).digest('hex'),
      ),
      methodology:
        'Warm public select calls on jsdom fixtures with 256 p elements. The layout field selects adjacent elements, text and comment separators, or a separate section wrapper per element. Each row records its match count. The default counts are 0, 1, 16, and 256. Single-class control and the requested disjoint selector groups return the same ordered nodes. Nine rotating timing rounds run for at least 50ms in batches of 1000 calls after 1000 warmups. Optional allocation profiling uses three rotating rounds of 2000 calls, includes collected objects, and records retained heap separately. Setup and compilation are outside timing and allocation samples. Use a separate process without --memory for timing conclusions.',
      rows,
    },
    null,
    2,
  ) + '\n',
)
console.log(`Wrote ${values.output}`)
