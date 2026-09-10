import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { JSDOM } from 'jsdom'
import type factory from '../../../dist/nwsapi.js'
import { components } from './documents.mts'
import { compareTiming } from './compare/timing.mts'

const require = createRequire(import.meta.url)
const source = readFileSync('dist/nwsapi.js', 'utf8')
// A benchmark-only compiler change. Only the ordinary attribute getter changes.
const original = `return v + '.getAttribute("' + name + '")'`
const replacement = `return 's.attrOf(' + v + ',"' + name + '")'`
assert.equal(
  source.split(original).length,
  2,
  'Expected one direct attribute reader',
)
const candidate = source.replace(original, () => replacement)
const directory = mkdtempSync(path.join(tmpdir(), 'nwsapi-attribute-reader-'))
const filename = path.join(directory, 'candidate.cjs')
const utils = require('jsdom/lib/generated/idl/utils.js') as {
  implForWrapper(node: Element): { getAttribute(name: string): string | null }
  wrapperForImpl(node: object): Element
}
const settings = { rounds: 5, milliseconds: 50, batch: 16 }
const rows = []
try {
  writeFileSync(filename, candidate)
  const factories: Array<typeof factory> = [
    require(path.resolve('dist/nwsapi.js')),
    require(filename),
  ]
  for (const [selector, scope] of [
    ['[data-testid]', 'document'],
    ['[data-testid="btn-150"]', 'document'],
    ['[data-testid]', 'element'],
  ] as const) {
    for (const mutate of [false, true]) {
      const worlds = factories.map((make, index) => {
        const { window } = new JSDOM(components())
        const root = window.document.getElementById('root')!
        const context = scope === 'document' ? window.document : root
        const engine = make(window)
        if (index) {
          const snapshot = engine.Snapshot as unknown as {
            attrOf(node: Element, name: string): string | null
          }
          snapshot.attrOf = (node, name) =>
            utils.implForWrapper(node).getAttribute(name)
        }
        const check = () => {
          const expected = Array.from(context.querySelectorAll(selector))
          assert.deepEqual(
            Array.from(engine.select(selector, context)),
            expected,
          )
          for (const node of expected) {
            assert.equal(utils.wrapperForImpl(utils.implForWrapper(node)), node)
          }
        }
        let iteration = 0
        const query = () => {
          if (mutate) {
            root.setAttribute('data-unrelated', String(iteration++))
          }
          return engine.select(selector, context).length
        }
        return { window, root, check, query }
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
          const node = world.root.querySelector('[data-testid="btn-150"]')!
          node.setAttribute('data-testid', '')
          world.check()
          node.removeAttribute('data-testid')
          world.check()
          node.setAttribute('data-testid', 'btn-150')
          world.check()
        }
        rows.push({ selector, scope, mutate, measurements })
        console.log(selector, scope, mutate)
      } finally {
        for (const world of worlds) {
          world.window.close()
        }
      }
    }
  }
  writeFileSync(
    process.argv[2] || 'assets/repo/bench/internal-attribute-reader.json',
    JSON.stringify(
      {
        node: process.version,
        jsdom: require('jsdom/package.json').version,
        mitata: require('mitata/package.json').version,
        hashes: [source, candidate].map(code =>
          createHash('sha256').update(code).digest('hex'),
        ),
        settings,
        methodology:
          'One benchmark-only change routes ordinary attribute reads through Snapshot.attrOf and implForWrapper(node).getAttribute(name). Baseline uses the current direct public getter. Existing 300-card component fixture, separate documents per variant, 100 warmup queries, five rotating mitata rounds, 16 calls per sample. Mutation cycles include one unrelated attribute write and one query. No manual GC. Identity, wrapper round-trip, and attribute mutation checks stay outside timing. No raw attribute lists, tree access, persistent implementation cache, or production changes. Results exclude initialization and do not establish memory or browser gains.',
        rows,
      },
      null,
      2,
    ) + '\n',
  )
} finally {
  delete require.cache[filename]
  rmSync(directory, { recursive: true })
}
