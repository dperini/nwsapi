import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import os from 'node:os'
import { JSDOM } from 'jsdom'
import factory from '../../../dist/nwsapi.js'
import { components } from './documents.mts'
import { parseArgs } from 'node:util'
import { sample, sampleFresh, timingEngine } from './timing.mts'

const require = createRequire(import.meta.url)
const jsdomRequire = createRequire(require.resolve('jsdom'))
const html = components()
const previous: { rows: Array<{ selector: string }> } = JSON.parse(
  readFileSync('assets/repo/bench/first-match-results.json', 'utf8'),
)
const selectors = previous.rows
  .map(row => row.selector)
  .filter(selector => !['.missing', '.absent > button'].includes(selector))
const { values } = parseArgs({
  options: {
    rounds: { type: 'string', default: '9' },
    iterations: { type: 'string', default: '1000' },
    output: {
      type: 'string',
      default: 'assets/repo/bench/first-query-states.json',
    },
  },
})
const rounds = Number(values.rounds)
const iterations = Number(values.iterations)
if (
  !Number.isInteger(rounds) ||
  rounds < 1 ||
  !Number.isInteger(iterations) ||
  iterations < 1
) {
  throw new RangeError('Use positive rounds and iterations.')
}
const rows = selectors.map(selector => ({
  selector,
  cold: [[], []] as number[][],
  warm: [[], []] as number[][],
}))
const oracle = new JSDOM(html)
const paths = selectors.map(selector => {
  let node: Node | null = oracle.window.document.querySelector(selector)
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
    const row = rows[index]!
    for (let turn = 0; turn < 2; turn++) {
      const engine = (round + turn) % 2
      const createContext = () => {
        const { window } = new JSDOM(html)
        const document = window.document
        const nw = engine === 0 ? factory(window) : null
        const expected = paths[index]!.reduce<Node>(
          (node, child) => node.childNodes[child]!,
          document,
        )
        return {
          window,
          expected,
          result: undefined as unknown,
          query:
            engine === 0
              ? () => nw!.first(row.selector, document)
              : () => document.querySelector(row.selector),
        }
      }
      const contexts: Array<ReturnType<typeof createContext>> = []
      try {
        const cold = await sampleFresh(
          () => {
            const context = createContext()
            contexts.push(context)
            return context
          },
          context => {
            context.result = context.query()
          },
        )
        for (const context of contexts) {
          if (context.result !== context.expected) {
            throw new Error(`Incorrect cold result: ${row.selector}`)
          }
        }
        row.cold[engine]!.push(cold)
        const context = contexts[contexts.length - 1]!
        const query = () => {
          if (context.query() !== context.expected) {
            throw new Error(`Incorrect warm result: ${row.selector}`)
          }
          consumed++
        }
        await sample(query, iterations, 20)
        row.warm[engine]!.push((await sample(query, iterations)).milliseconds)
      } finally {
        for (const context of contexts) {
          context.window.close()
        }
      }
    }
  }
  console.log(`Completed round ${round + 1}/${rounds}`)
}
const median = (samples: number[]) =>
  samples.toSorted((a: number, b: number) => a - b)[
    Math.floor(samples.length / 2)
  ]
const hash = (data: string | Buffer) =>
  createHash('sha256').update(data).digest('hex')
writeFileSync(
  values.output,
  JSON.stringify(
    {
      metadata: {
        timestamp: new Date().toISOString(),
        operation: 'first',
        engines: [
          'nwsapi',
          '@asamuzakjp/dom-selector through jsdom.querySelector',
        ],
        candidateSha256: hash(readFileSync('dist/nwsapi.js')),
        fixtureSha256: hash(html),
        node: process.version,
        cpu: os.cpus()[0]?.model,
        jsdom: require('jsdom/package.json').version,
        competitor: jsdomRequire('@asamuzakjp/dom-selector/package.json')
          .version,
        rounds,
        iterations,
        timingEngine,
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
