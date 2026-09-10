import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { setImmediate } from 'node:timers/promises'
import path from 'node:path'
import { JSDOM } from 'jsdom'
import type Adapter from '../../../dist/adapter/dom-selector.js'

assert.equal(typeof global.gc, 'function', 'Run with --expose-gc')
const require = createRequire(import.meta.url)
const baseline = path.resolve(process.argv[2]!)
const idlUtils = require('jsdom/lib/generated/idl/utils.js') as {
  implForWrapper(node: Node): object
}
const {
  domSymbolTree,
} = require('jsdom/lib/jsdom/living/helpers/internal-constants.js')
const factories: Array<typeof Adapter> = [
  require(path.join(baseline, 'dom-selector.js')),
  require('../../../dist/adapter/dom-selector.js'),
]
const rows = []
function populate(Constructor: typeof Adapter) {
  const { window } = new JSDOM('<body></body>')
  const document = window.document
  const adapter = new Constructor(window, idlUtils.implForWrapper(document), {
    idlUtils,
    domSymbolTree,
  })
  const refs: Array<WeakRef<Node>> = []
  for (let i = 0; i < 40; ++i) {
    const root = document.createElement('main')
    root.innerHTML =
      '<section><i data-hit="yes"></i>text<b></b></section>'.repeat(32)
    document.body.appendChild(root)
    const impl = idlUtils.implForWrapper(root)
    assert.equal(
      adapter.querySelectorAll('main section > i[data-hit="yes"] + b', impl)
        .length,
      32,
    )
    root.firstElementChild!.firstElementChild!.setAttribute('data-hit', 'no')
    assert.equal(
      adapter.querySelectorAll('main section > i[data-hit="yes"] + b', impl)
        .length,
      31,
    )
    refs.push(
      new WeakRef(root),
      new WeakRef(root.firstElementChild!.firstElementChild!),
    )
    root.remove()
  }
  adapter.querySelectorAll('body', idlUtils.implForWrapper(document))
  return { window, adapter, refs }
}
for (let round = 0; round < 3; ++round) {
  for (let offset = 0; offset < 2; ++offset) {
    const variant = (round + offset) % 2
    const state = populate(factories[variant]!)
    try {
      for (let pass = 0; pass < 4; ++pass) {
        await setImmediate()
        global.gc!()
      }
      const surviving = state.refs.filter(ref => ref.deref()).length
      assert.equal(surviving, 0)
      assert.ok(state.adapter.engine)
      rows.push({
        round,
        variant,
        observedNodes: state.refs.length,
        survivingNodes: surviving,
      })
    } finally {
      state.window.close()
    }
  }
}
writeFileSync(
  'assets/repo/bench/host-readers-retention.json',
  JSON.stringify(
    {
      node: process.version,
      hashes: [
        path.join(baseline, 'nwsapi.js'),
        'dist/nwsapi.js',
        path.join(baseline, 'dom-selector.js'),
        'dist/adapter/dom-selector.js',
      ].map(file =>
        createHash('sha256').update(readFileSync(file)).digest('hex'),
      ),
      methodology:
        'Three rotating rounds. Keep document and adapter alive. Query 40 contexts through internal attribute and tree readers, mutate an attribute and query again, detach roots, release public query scope, then four task-separated forced GCs. Observe root and child WeakRefs. This checks detached-node collection, not retained-byte savings or every possible leak.',
      rows,
    },
    null,
    2,
  ) + '\n',
)
