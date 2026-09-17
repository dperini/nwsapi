import type EngineFactory from '../../../../dist/nwsapi.js'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { Session } from 'node:inspector/promises'
import { createRequire } from 'node:module'
import path from 'node:path'
import { parseArgs } from 'node:util'
import { JSDOM } from 'jsdom'
import { median } from '../timing.mts'

const { values } = parseArgs({
  options: {
    baseline: { type: 'string' },
    candidate: { type: 'string', default: 'dist/nwsapi.js' },
    output: { type: 'string', default: 'assets/repo/bench/has.json' },
    profile: { type: 'boolean', default: false },
  },
})
assert(values.baseline, 'Pass --baseline <previous engine build>')
const require = createRequire(import.meta.url)
const files = [values.baseline, values.candidate].map(file =>
  path.resolve(file),
)
const factories = files.map(file => require(file) as typeof EngineFactory)
const specs = [
  { name: 'many hits', selector: 'section:has([data-hit])', hit: 'all' },
  { name: 'late hit', selector: 'section:has([data-hit])', hit: 'last' },
  { name: 'miss', selector: 'section:has([data-hit])', hit: 'none' },
  {
    name: 'branches',
    selector: 'section:has([data-hit], .missing)',
    hit: 'all',
  },
  {
    name: 'sibling',
    selector: 'section:has(+ section [data-hit])',
    hit: 'all',
  },
  {
    name: 'general sibling',
    selector: 'section:has(~ section [data-hit])',
    hit: 'all',
  },
  {
    name: 'general sibling late hit',
    selector: 'section:has(~ section [data-hit])',
    hit: 'last-section',
  },
  {
    name: 'late position',
    selector: 'section:has(p:nth-child(20))',
    hit: 'all',
  },
  { name: 'child type control', selector: 'section:has(> p)', hit: 'all' },
]
const rows = []
const profiles = []
for (const spec of specs) {
  let html = '<!doctype html><main>'
  for (let group = 0; group < 20; ++group) {
    html += '<section>'
    for (let child = 0; child < 20; ++child) {
      html += `<p${spec.hit === 'all' || (spec.hit === 'last' && child === 19) || (spec.hit === 'last-section' && group === 19 && child === 19) ? ' data-hit' : ''}></p>`
    }
    html += '</section>'
  }
  const { window } = new JSDOM(html + '</main>')
  try {
    const doc = window.document
    const expected = Array.from(doc.querySelectorAll(spec.selector))
    const engines = factories.map(factory => factory(window))
    for (const mode of ['select', 'first'] as const) {
      const query = (engine: ReturnType<typeof EngineFactory>) =>
        mode === 'select'
          ? engine.select(spec.selector, doc)
          : engine.first(spec.selector, doc)
      const check = (result: ReturnType<typeof query>) => {
        if (mode === 'select') {
          const nodes = result as Element[]
          assert.equal(nodes.length, expected.length)
          for (let i = 0; i < nodes.length; ++i) {
            assert.equal(nodes[i], expected[i])
          }
        } else {
          assert.equal(result, expected[0] || null)
        }
      }
      const warm: number[][] = [[], []]
      const cold: number[][] = [[], []]
      for (const engine of engines) {
        check(query(engine))
      }
      for (let round = 0; round < 5; ++round) {
        for (let offset = 0; offset < engines.length; ++offset) {
          const index = (round + offset) % engines.length
          let result
          const start = performance.now()
          for (let i = 0; i < 100; ++i) {
            result = query(engines[index]!)
          }
          warm[index]!.push((performance.now() - start) / 100)
          check(result!)
          let elapsed = 0
          for (let i = 0; i < 10; ++i) {
            const fresh = factories[index]!(window)
            const coldStart = performance.now()
            result = query(fresh)
            elapsed += performance.now() - coldStart
            check(result)
          }
          cold[index]!.push(elapsed / 10)
        }
      }
      rows.push({
        name: spec.name,
        selector: spec.selector,
        mode,
        matches: expected.length,
        warm: warm.map(samples => ({
          samplesMs: samples,
          medianMs: median(samples),
        })),
        cold: cold.map(samples => ({
          samplesMs: samples,
          medianMs: median(samples),
        })),
      })
    }
    if (values.profile && spec.name === 'many hits') {
      for (let index = 0; index < engines.length; ++index) {
        const session = new Session()
        session.connect()
        await session.post('Profiler.enable')
        await session.post('Profiler.start')
        for (let i = 0; i < 1000; ++i) {
          engines[index]!.select(spec.selector, doc)
        }
        const { profile } = await session.post('Profiler.stop')
        session.disconnect()
        const frames = new Map(
          profile.nodes.map(node => [node.id, node.callFrame]),
        )
        const counts = new Map<string, number>()
        for (const id of profile.samples || []) {
          const frame = frames.get(id)!
          const key = `${frame.functionName || '(anonymous)'} (${path.basename(frame.url)}:${frame.lineNumber + 1})`
          counts.set(key, (counts.get(key) || 0) + 1)
        }
        profiles.push({
          engine: index,
          sampleCount: profile.samples?.length || 0,
          topSelf: Array.from(counts)
            .toSorted((a, b) => b[1] - a[1])
            .slice(0, 15),
        })
      }
    }
  } finally {
    window.close()
  }
}
const hash = (file: string) =>
  createHash('sha256').update(readFileSync(file)).digest('hex')
writeFileSync(
  values.output,
  JSON.stringify(
    {
      runtime: process.version,
      platform: process.platform,
      architecture: process.arch,
      jsdom: require('jsdom/package.json').version,
      engines: files.map(file => ({ sha256: hash(file) })),
      methodology:
        'Baseline then candidate columns. Twenty sections contain twenty children each. Five alternating rounds use 100 warm queries and 10 fresh-engine first queries per engine. Cold timers exclude engine construction. Identity and order are checked outside timers. Optional profiles are separate batches of 1000 many-hit selections. No rendering is measured.',
      rows,
      profiles,
    },
    null,
    2,
  ) + '\n',
)
console.log(`Wrote ${values.output}`)
