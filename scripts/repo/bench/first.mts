import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import { JSDOM } from 'jsdom'
import factory from '../../../src/nwsapi.js'
import { components } from './documents.mts'

// Compare a saved, built CommonJS engine with the current build. Browser
// regression tests independently check these selector forms; this diagnostic
// verifies exact host-node identity against jsdom before each measurement.
const [baseline, output] = process.argv.slice(2)
if (!baseline || !output) {
  throw new Error('Usage: first.mts <baseline.cjs> <output.json>')
}
const require = createRequire(import.meta.url)
const html = components()
const { window } = new JSDOM(html)
const doc = window.document
const before = require(path.resolve(baseline))(window)
const after = factory(window)
const rounds = 9
const iterations = 1000
const rows = []
let consumed = 0
try {
  for (const selector of [
    '.card',
    'button',
    'button.primary',
    'input.input',
    '.missing',
    '.card > button.primary',
    '[data-testid]',
    'div > button',
    ':where(.card) > button',
    'div:nth-child(2n)',
    'input, button',
    ':is(button, input)',
    'button:not(.missing)',
    '.absent > button',
  ]) {
    const queries = [
      () => before.first(selector, doc),
      () => after.first(selector, doc),
      () => doc.querySelector(selector),
    ]
    const expected = doc.querySelector(selector)
    const samples: number[][] = [[], [], []]
    for (const query of queries) {
      if (query() !== expected) {
        throw new Error(`Incorrect first match: ${selector}`)
      }
      for (let i = 0; i < 100; ++i) {
        query()
      }
    }
    for (let round = 0; round < rounds; ++round) {
      for (let offset = 0; offset < queries.length; ++offset) {
        const index = (round + offset) % queries.length
        const start = process.hrtime.bigint()
        for (let i = 0; i < iterations; ++i) {
          consumed += queries[index]() !== null ? 1 : 0
        }
        samples[index].push(
          Number(process.hrtime.bigint() - start) / iterations / 1e6,
        )
      }
    }
    const milliseconds = samples.map(
      sample => sample.toSorted((a, b) => a - b)[4],
    )
    rows.push({ selector, milliseconds, samples })
    console.log(selector, milliseconds.map(ms => ms.toFixed(6)).join(' / '))
  }
} finally {
  window.close()
}
const hash = (data: string | Buffer) =>
  crypto.createHash('sha256').update(data).digest('hex')
const jsdomRequire = createRequire(require.resolve('jsdom'))
const data = {
  metadata: {
    timestamp: new Date().toISOString(),
    operation: 'first',
    engines: [
      'saved NWSAPI build',
      'current NWSAPI build',
      'jsdom querySelector',
    ],
    baselineSha256: hash(fs.readFileSync(baseline)),
    candidateSha256: hash(fs.readFileSync('src/nwsapi.js')),
    fixtureSha256: hash(html),
    node: process.version,
    cpu: os.cpus()[0]?.model,
    jsdom: require('jsdom/package.json').version,
    competitor: jsdomRequire('@asamuzakjp/dom-selector/package.json').version,
    rounds,
    iterations,
    consumed,
  },
  rows,
}
fs.mkdirSync(path.dirname(output), { recursive: true })
fs.writeFileSync(output, JSON.stringify(data, null, 2) + '\n')
