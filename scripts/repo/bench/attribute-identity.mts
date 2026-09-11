import { createRequire } from 'node:module'
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { JSDOM } from 'jsdom'
import type factory from '../../../dist/nwsapi.js'
import type Adapter from '../../../dist/adapter/dom-selector.js'
import { components } from './documents.mts'
import { compareTiming } from './compare/timing.mts'

const baseline = process.argv[2]
if (!baseline) {
  throw new Error(
    'Pass the baseline directory containing nwsapi.js and dom-selector.js',
  )
}
const require = createRequire(import.meta.url)
const directories = [path.resolve(baseline), path.resolve('dist')]
const settings = { rounds: 5, milliseconds: 50, batch: 16 }
const rows = []
for (const route of ['core', 'adapter']) {
  for (const [selector, scope] of [
    ['[data-testid]', 'document'],
    ['[data-testid="btn-150"]', 'document'],
    ['[data-testid]', 'element'],
  ] as const) {
    for (const queriesPerMutation of [0, 1, 4]) {
      const worlds = directories.map(directory => {
        const { window } = new JSDOM(components())
        const root = window.document.getElementById('root')!
        const context = scope === 'document' ? window.document : root
        const expected = Array.from(context.querySelectorAll(selector))
        const make: typeof factory = require(path.join(directory, 'nwsapi.js'))
        const Constructor: typeof Adapter = require(
          path.join(directory, 'dom-selector.js'),
        )
        const engine = route === 'core' ? make(window) : null
        const adapter = route === 'adapter' ? new Constructor(window) : null
        let mutation = 0
        const query = () =>
          engine
            ? engine.select(selector, context)
            : adapter!.querySelectorAll(selector, context)
        const check = () => {
          const actual = query()
          if (
            actual.length !== expected.length ||
            expected.some((node, i) => node !== actual[i])
          ) {
            throw new Error('Attribute identity/order mismatch')
          }
        }
        const cycle = () => {
          if (queriesPerMutation) {
            root.setAttribute('data-unrelated', String(mutation++))
          }
          let count = 0
          for (let i = 0; i < (queriesPerMutation || 1); ++i) {
            count += query().length
          }
          return count
        }
        return { window, check, cycle }
      })
      try {
        for (const world of worlds) {
          world.check()
          for (let i = 0; i < 100; ++i) {
            world.cycle()
          }
        }
        const measurements = await compareTiming(
          worlds.map(world => world.cycle),
          settings,
        )
        for (const world of worlds) {
          world.check()
        }
        rows.push({ route, selector, scope, queriesPerMutation, measurements })
        console.log(route, selector, scope, queriesPerMutation)
      } finally {
        for (const world of worlds) {
          world.window.close()
        }
      }
    }
  }
}
writeFileSync(
  process.argv[3] || 'assets/repo/bench/attribute-identity.json',
  JSON.stringify(
    {
      node: process.version,
      settings,
      hashes: directories.map(directory =>
        createHash('sha256')
          .update(readFileSync(path.join(directory, 'nwsapi.js')))
          .digest('hex'),
      ),
      methodology:
        'Existing 300-card component fixture. Separate documents and adapters per variant. Five rotating mitata rounds after 100 warmup cycles, 16 cycles per sample, no manual GC. Zero means one warm query; otherwise one unrelated mutation followed by one or four queries. Reports nanoseconds per cycle, including mutation. Identity/order checks before and after timing.',
      rows,
    },
    null,
    2,
  ) + '\n',
)
