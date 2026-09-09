import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { setTimeout } from 'node:timers/promises'
import { getHeapStatistics } from 'node:v8'
import { JSDOM } from 'jsdom'
import type factory from '../../../../dist/nwsapi.js'
import { options, metadata, writeReport } from './options.mts'

const config = options()
if (!global.gc) {
  throw new Error('Retention measurement requires node --expose-gc')
}
const require = createRequire(import.meta.url)
const make = config.paths.map(p => require(p) as typeof factory)
const samples = []
const heap = async () => {
  for (let pass = 0; pass < 4; ++pass) {
    await setTimeout(0)
    global.gc!()
  }
  return getHeapStatistics().used_heap_size
}
for (let round = 0; round < config.settings.rounds; ++round) {
  for (let turn = 0; turn < 2; ++turn) {
    const index = (round + turn) % 2
    const { window } = new JSDOM('<!doctype html><body></body>')
    try {
      const engine = make[index]!(window)
      let anchor: Element | null = window.document.createElement('section')
      anchor.innerHTML = '<p class="hit" data-hit></p>'.repeat(24)
      window.document.body.append(anchor)
      const refs = [new WeakRef(anchor), new WeakRef(anchor.firstElementChild!)]
      engine.select('body', window.document)
      const initial = await heap()
      const plans = async (start: number, count: number) => {
        for (let i = start; i < start + count; ++i) {
          assert.equal(
            engine.Snapshot.has(`[data-miss="${i}"]`, anchor!),
            false,
          )
        }
        return heap()
      }
      assert.equal(engine.Snapshot.has('[data-hit]', anchor), true)
      const populated = await plans(0, 512)
      const saturated = await plans(512, 8192)
      const churned = await plans(8704, 8192)
      anchor.remove()
      anchor = null
      // Release the last public scope while keeping the engine alive.
      engine.select('body', window.document)
      const detached = await heap()
      const survivingNodes = refs.filter(ref => ref.deref()).length
      assert.equal(survivingNodes, 0, 'Detached anchor or descendant retained')
      engine.configure({}, true)
      const cleared = await heap()
      samples.push({
        round,
        engine: index,
        initial,
        populated,
        saturated,
        churned,
        detached,
        cleared,
        survivingNodes,
      })
    } finally {
      window.close()
    }
  }
  console.log(`Node retention: round ${round + 1}/${config.settings.rounds}`)
}
writeReport(config.output, {
  ...metadata(config),
  mode: 'retention',
  node: process.version,
  jsdom: require('jsdom/package.json').version,
  methodology:
    'Rotating variants in fresh jsdom windows. Keep the engine alive through 512, then 8192, then another 8192 distinct relative plans. Measure whole-process used heap after four task-separated forced GCs. Remove the anchor and release public query scope before checking WeakRefs to the anchor and child. Finally clear caches. Stage differences include jsdom and runtime caches. They are retained heap, not allocation traffic. WeakRef assertions cover these two nodes and are not proof of absence of all leaks.',
  samples,
})
