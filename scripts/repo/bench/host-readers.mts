import { createRequire } from 'node:module'
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { JSDOM } from 'jsdom'
import type Adapter from '../../../dist/dom-selector.js'
import { components } from './documents.mts'
import { fixture, selectors, checkResults } from './compare/fixture.mts'
import { compareTiming } from './compare/timing.mts'

const require = createRequire(import.meta.url)
const baseline = path.resolve(process.argv[2]!)
const utils = require('jsdom/lib/generated/idl/utils.js') as {
  implForWrapper(node: Node): object
}
const {
  domSymbolTree,
} = require('jsdom/lib/jsdom/living/helpers/internal-constants.js')
const factories: Array<typeof Adapter> = [
  require(path.join(baseline, 'dom-selector.js')),
  require('../../../dist/dom-selector.js'),
  require('../../../dist/dom-selector.js'),
]
const cases = [
  ...['[data-testid]', '[data-testid="btn-150"]'].flatMap(selector =>
    [false, true].map(mutate => ({ selector, mutate, html: components() })),
  ),
  ...['adjacent', 'nested'].flatMap(layout =>
    selectors(4, 'ancestor').map(selector => ({
      selector,
      mutate: false,
      html: fixture(256, 4, layout as 'adjacent' | 'nested', 'ancestor'),
    })),
  ),
  ...selectors(4, 'has').map(selector => ({
    selector,
    mutate: false,
    html: fixture(16, 4, 'adjacent', 'has'),
  })),
]
const rows = []
const settings = { rounds: 5, milliseconds: 50, batch: 16 }
for (const entry of cases) {
  const worlds = factories.map((Constructor, variant) => {
    const { window } = new JSDOM(entry.html)
    const document = window.document
    const expected = Array.from(document.querySelectorAll(entry.selector))
    const impl = utils.implForWrapper(document)
    const adapter = new Constructor(window, impl, {
      idlUtils: utils,
      ...(variant === 1 ? {} : { domSymbolTree }),
    })
    let version = 0
    const query = () => {
      if (entry.mutate) {
        document.documentElement.setAttribute(
          'data-unrelated',
          String(version++),
        )
      }
      return adapter.querySelectorAll(entry.selector, impl)
    }
    return { window, query, check: () => checkResults(query(), expected) }
  })
  try {
    for (const world of worlds) {
      world.check()
      for (let i = 0; i < 100; ++i) {
        world.query()
      }
    }
    const measurements = await compareTiming(
      worlds.map(world => world.query),
      settings,
    )
    for (const world of worlds) {
      world.check()
    }
    rows.push({
      selector: entry.selector,
      mutate: entry.mutate,
      fixtureHash: createHash('sha256').update(entry.html).digest('hex'),
      measurements,
    })
    console.log(entry.selector, entry.mutate)
  } finally {
    for (const world of worlds) {
      world.window.close()
    }
  }
}
writeFileSync(
  process.argv[3] || 'assets/repo/bench/host-readers.json',
  JSON.stringify(
    {
      node: process.version,
      jsdom: require('jsdom/package.json').version,
      settings,
      variants: ['baseline', 'attributes', 'attributes-and-tree'],
      hashes: [
        path.join(baseline, 'nwsapi.js'),
        'dist/nwsapi.js',
        path.join(baseline, 'dom-selector.js'),
        'dist/dom-selector.js',
      ].map(file =>
        createHash('sha256').update(readFileSync(file)).digest('hex'),
      ),
      methodology:
        'Existing component, shallow/deep ancestor, and four has fixtures. Separate documents per variant. Public adapter receives host implementation nodes. Five rotating mitata rounds after 100 warmups. Sixteen calls per sample. Identity/order checks outside timing. Mutation includes one unrelated attribute write and one query. No memory or browser claim.',
      rows,
    },
    null,
    2,
  ) + '\n',
)
