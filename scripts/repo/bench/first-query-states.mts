import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import os from 'node:os'
import { JSDOM } from 'jsdom'
import factory from '../../../src/nwsapi.js'
import { components } from './documents.mts'

const require = createRequire(import.meta.url)
const jsdomRequire = createRequire(require.resolve('jsdom'))
const html = components()
const previous = JSON.parse(
  readFileSync('assets/repo/bench/first-match-results.json', 'utf8'),
)
const selectors = previous.rows
  .map(row => row.selector)
  .filter(selector => !['.missing', '.absent > button'].includes(selector))
const rounds = 9
const iterations = 1000
const rows = selectors.map(selector => ({
  selector,
  cold: [[], []] as number[][],
  warm: [[], []] as number[][],
}))
const oracle = new JSDOM(html)
const paths = selectors.map(selector => {
  let node = oracle.window.document.querySelector(selector)
  if (!node) {
    throw new Error(`Expected a nonempty query: ${selector}`)
  }
  const route: number[] = []
  while (node.parentNode) {
    route.unshift(
      Array.prototype.indexOf.call(node.parentNode.childNodes, node),
    )
    node = node.parentNode
  }
  return route
})
oracle.window.close()
let consumed = 0
for (let round = 0; round < rounds; round++) {
  for (let offset = 0; offset < rows.length; offset++) {
    const index = (round + offset) % rows.length
    const row = rows[index]
    for (let turn = 0; turn < 2; turn++) {
      const engine = (round + turn) % 2
      // Each engine gets a separate fresh document. Neither query runs before
      // the cold timer. Fixture and explicit factory setup are outside timing.
      const { window } = new JSDOM(html)
      try {
        const document = window.document
        const nw = engine === 0 ? factory(window) : null
        const expected = paths[index].reduce(
          (node, child) => node.childNodes[child],
          document,
        )
        const query =
          engine === 0
            ? () => nw.first(row.selector, document)
            : () => document.querySelector(row.selector)
        const start = process.hrtime.bigint()
        const result = query()
        const cold = Number(process.hrtime.bigint() - start) / 1e6
        if (result !== expected) {
          throw new Error(`Incorrect cold result: ${row.selector}`)
        }
        row.cold[engine].push(cold)
        const warmUntil = performance.now() + 20
        do {
          query()
        } while (performance.now() < warmUntil)
        const warmStart = process.hrtime.bigint()
        for (let i = 0; i < iterations; i++) {
          if (query() !== expected) {
            throw new Error(`Incorrect warm result: ${row.selector}`)
          }
          consumed++
        }
        row.warm[engine].push(
          Number(process.hrtime.bigint() - warmStart) / iterations / 1e6,
        )
      } finally {
        window.close()
      }
    }
  }
  console.log(`Completed round ${round + 1}/${rounds}`)
}
const median = values =>
  values.toSorted((a, b) => a - b)[Math.floor(values.length / 2)]
const hash = data => createHash('sha256').update(data).digest('hex')
writeFileSync(
  'assets/repo/bench/first-query-states.json',
  JSON.stringify(
    {
      metadata: {
        timestamp: new Date().toISOString(),
        operation: 'first',
        engines: [
          'nwsapi',
          '@asamuzakjp/dom-selector through jsdom.querySelector',
        ],
        candidateSha256: hash(readFileSync('src/nwsapi.js')),
        fixtureSha256: hash(html),
        node: process.version,
        cpu: os.cpus()[0]?.model,
        jsdom: require('jsdom/package.json').version,
        competitor: jsdomRequire('@asamuzakjp/dom-selector/package.json')
          .version,
        rounds,
        iterations,
        warmupMilliseconds: 20,
        consumed,
        cold: 'First query on a fresh document; fixture creation and explicit NWSAPI factory setup are excluded. This is not fresh-process startup.',
        warm: 'Repeated query after warmup on that document.',
        order:
          'Rotate selector order and alternate engines each round. Use separate documents to avoid shared DOM collection caches.',
        excludedEmptyQueries: ['.missing', '.absent > button'],
      },
      rows: rows.map(row => ({
        selector: row.selector,
        cold: row.cold.map(median),
        warm: row.warm.map(median),
        samples: { cold: row.cold, warm: row.warm },
      })),
    },
    null,
    2,
  ) + '\n',
)
