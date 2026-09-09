import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { JSDOM } from 'jsdom'
import factory from '../../../dist/nwsapi.js'
import { profileAncestorMemory } from './ancestor-memory.mts'

const [output, enginePath] = process.argv.slice(2)
if (!output) {
  throw new Error('Usage: candidate-memory.mts <output.json> [engine.cjs]')
}
const make: typeof factory = enginePath
  ? createRequire(import.meta.url)(resolve(enginePath))
  : factory
const { window } = new JSDOM(
  '<!doctype html><body>' +
    '<section class="box"><div class="inner"><p class="content"></p><p class="content"></p></div></section>'.repeat(
      128,
    ),
)
const rows = []
try {
  const engine = make(window)
  const doc = window.document
  const candidates = Array.from(doc.getElementsByClassName('content'))
  for (const selector of ['.content', '.box .inner > .content']) {
    const resolver = engine.compile(selector, true)!
    const queries = [
      () => resolver(candidates, null, doc, []),
      () => engine.select(selector, doc),
      () => engine.byClass('content', doc),
    ]
    const expected = Array.from(doc.querySelectorAll(selector))
    for (const query of queries) {
      const result = query()
      assert(typeof result !== 'boolean')
      assert.equal(result.length, expected.length)
      for (let i = 0; i < expected.length; ++i) {
        assert.equal(result[i], expected[i])
      }
      for (let i = 0; i < 100; ++i) {
        query()
      }
    }
    rows.push({
      selector,
      candidates: candidates.length,
      matches: expected.length,
      memory: await profileAncestorMemory(
        index => queries[index]!(),
        ['compiled', 'select', 'lookup'],
      ),
    })
  }
} finally {
  window.close()
}
writeFileSync(
  output,
  JSON.stringify(
    {
      node: process.version,
      engineSha256: createHash('sha256')
        .update(readFileSync(enginePath || 'dist/nwsapi.js'))
        .digest('hex'),
      methodology:
        'Three rotating Node allocation rounds per route. Each sample covers 2000 warm calls with collected objects included at a 1024byte sampling interval. Compiled uses preselected candidates and a fresh result array. Select includes public query dispatch and candidate lookup. Lookup only calls byClass and is not an equivalent selector query. Routes share a static 256-candidate jsdom fixture. Ordered results are checked before profiling. Compilation and fixture setup are excluded. Retained heap uses four GCs before readings and two batches of 2000 calls. Allocation differences are diagnostic, not an exact attribution to array copying.',
      rows,
    },
    null,
    2,
  ) + '\n',
)
console.log(`Wrote ${output}`)
