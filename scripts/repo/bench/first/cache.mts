import { createHash } from 'node:crypto'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import os from 'node:os'
import path from 'node:path'
import { JSDOM } from 'jsdom'
import factory from '../../../../dist/nwsapi.js'
import { components } from '../documents.mts'
import { sample, timingEngine } from '../timing.mts'

const [original, coldFix, outputArgument] = process.argv.slice(2)
if (!original || !coldFix) {
  throw new Error(
    'Usage: first-cache.mts <original.cjs> <cold-fix.cjs> [output.json]',
  )
}
const output =
  outputArgument ||
  path.join(
    mkdtempSync(path.join(os.tmpdir(), 'nwsapi-first-cache-')),
    'results.json',
  )
const require = createRequire(import.meta.url)
const html = components()
const worlds = [
  require(path.resolve(original)),
  require(path.resolve(coldFix)),
  factory,
].map(create => {
  const { window } = new JSDOM(html)
  return { window, engine: create(window), doc: window.document }
})
const iterations = 100_000
const rounds = 9
const rows = []
let consumed = 0
try {
  for (const selector of [
    '.card',
    'button.primary',
    'input.input',
    '.card > button.primary',
    '.missing',
  ]) {
    const queries = worlds.map(({ engine, doc }) => {
      const expected = doc.querySelector(selector)
      return () => {
        const result = engine.first(selector, doc)
        if (result !== expected) {
          throw new Error(`Incorrect result: ${selector}`)
        }
        consumed += result ? 1 : 0
      }
    })
    const samples: number[][] = [[], [], []]
    for (const query of queries) {
      await sample(query, iterations, 150)
    }
    for (let round = 0; round < rounds; ++round) {
      for (let offset = 0; offset < queries.length; ++offset) {
        const index = (round + offset) % queries.length
        const result = await sample(queries[index]!, iterations)
        samples[index]!.push(result.milliseconds)
      }
    }
    const milliseconds = samples.map(
      values => values.toSorted((a, b) => a - b)[4]!,
    )
    rows.push({ selector, milliseconds, samples })
    console.log(
      selector,
      milliseconds.map(value => (value * 1000).toFixed(3)).join(' / '),
    )
  }
} finally {
  for (const { window } of worlds) {
    window.close()
  }
}
const hash = (file: string) =>
  createHash('sha256').update(readFileSync(file)).digest('hex')
writeFileSync(
  output,
  JSON.stringify(
    {
      metadata: {
        timestamp: new Date().toISOString(),
        engines: ['before cold fix', 'cold fix', 'current'],
        sourceSha256: [hash(original), hash(coldFix), hash('dist/nwsapi.js')],
        node: process.version,
        cpu: os.cpus()[0]?.model,
        jsdom: require('jsdom/package.json').version,
        iterations,
        rounds,
        timingEngine,
        warmupMilliseconds: 150,
        consumed,
        method:
          'Separate documents per engine. Rotate engine order each round. Check exact element identity on every call. Milliseconds per query.',
      },
      rows,
    },
    null,
    2,
  ) + '\n',
)
console.log(output)
