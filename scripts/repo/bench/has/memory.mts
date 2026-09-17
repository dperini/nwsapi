import { browserLaunchOptions } from '../../browser.mts'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { parseArgs } from 'node:util'
import { chromium } from '@playwright/test'
import type factory from '../../../../dist/nwsapi.js'

type Host = Window & {
  engine: ReturnType<typeof factory>
  anchor: Element | null
  refs: Array<WeakRef<Element>>
}
const { values } = parseArgs({
  options: {
    baseline: { type: 'string' },
    candidate: { type: 'string', default: 'dist/nwsapi.js' },
    rounds: { type: 'string', default: '3' },
    output: { type: 'string', default: 'assets/repo/bench/has-memory.json' },
  },
})
assert(values.baseline, 'Pass --baseline <previous engine build>')
const rounds = Number(values.rounds)
assert(Number.isSafeInteger(rounds) && rounds > 0 && rounds <= 10)
const files = [values.baseline, values.candidate]
const sources = files.map(file => readFileSync(file, 'utf8'))
const browser = await chromium.launch(browserLaunchOptions())
const samples = []
try {
  for (let round = 0; round < rounds; ++round) {
    for (let turn = 0; turn < 2; ++turn) {
      const index = (round + turn) % 2
      const page = await browser.newPage()
      const session = await page.context().newCDPSession(page)
      try {
        await page.setContent('<!doctype html><body></body>')
        await page.addScriptTag({ content: sources[index]! })
        await page.evaluate(() => {
          const host = window as unknown as Host & {
            NW: { Dom: Host['engine'] }
          }
          host.engine = host.NW.Dom
          const anchor = document.createElement('section')
          anchor.innerHTML = '<p class="hit" data-hit></p>'.repeat(24)
          document.body.append(anchor)
          host.anchor = anchor
          host.refs = [
            new WeakRef(anchor),
            new WeakRef(anchor.firstElementChild!),
          ]
          host.engine.select('body', document)
        })
        const heap = async () => {
          // Separate tasks release WeakRef keep-alive roots before each GC.
          for (let pass = 0; pass < 4; ++pass) {
            await page.evaluate(
              () => new Promise(resolve => setTimeout(resolve, 0)),
            )
            await session.send('HeapProfiler.collectGarbage')
          }
          return (await session.send('Runtime.getHeapUsage')).usedSize
        }
        const initial = await heap()
        await page.evaluate(() => {
          const host = window as unknown as Host
          for (let i = 0; i < 100; ++i) {
            assertHit(host.engine.Snapshot.has('[data-hit]', host.anchor!))
          }
          function assertHit(value: boolean) {
            if (!value) {
              throw new Error('Expected matching descendant')
            }
          }
        })
        await session.send('HeapProfiler.startSampling', {
          samplingInterval: 1024,
          includeObjectsCollectedByMajorGC: true,
          includeObjectsCollectedByMinorGC: true,
        })
        await page.evaluate(() => {
          const host = window as unknown as Host
          for (let i = 0; i < 10_000; ++i) {
            if (!host.engine.Snapshot.has('[data-hit]', host.anchor!)) {
              throw new Error('Expected matching descendant')
            }
          }
        })
        const { profile } = await session.send('HeapProfiler.stopSampling')
        let sampledBytes = 0
        let collectionCopyBytes = 0
        const visit = (node: typeof profile.head, copying = false) => {
          const inCopy =
            copying || node.callFrame.functionName === 'collectionCopy'
          sampledBytes += node.selfSize
          if (inCopy) {
            collectionCopyBytes += node.selfSize
          }
          for (const child of node.children) {
            visit(child, inCopy)
          }
        }
        visit(profile.head)
        const queryPlans = async (offset: number, amount: number) => {
          await page.evaluate(
            ({ start, count }) => {
              const host = window as unknown as Host
              for (let i = start; i < start + count; ++i) {
                if (
                  host.engine.Snapshot.has(`[data-miss="${i}"]`, host.anchor!)
                ) {
                  throw new Error('Unexpected cache-churn match')
                }
              }
            },
            { start: offset, count: amount },
          )
          return heap()
        }
        const populated = await queryPlans(0, 512)
        const saturated = await queryPlans(512, 8192)
        const churned = await queryPlans(8704, 8192)
        await page.evaluate(() => {
          const host = window as unknown as Host
          host.anchor!.remove()
          host.anchor = null
          // Public queries intentionally retain their most recent scope.
          host.engine.select('body', document)
        })
        const detached = await heap()
        const survivingNodes = await page.evaluate(
          () =>
            (window as unknown as Host).refs.filter(ref => ref.deref()).length,
        )
        assert.equal(
          survivingNodes,
          0,
          'Detached anchor or descendant retained',
        )
        await page.evaluate(() => {
          const host = window as unknown as Host
          host.engine.configure({}, true)
        })
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
          sampledBytes,
          collectionCopyBytes,
        })
      } finally {
        await page.close()
      }
    }
    console.log(`Has cache memory: round ${round + 1}/${rounds}`)
  }
  writeFileSync(
    values.output,
    JSON.stringify(
      {
        runtime: browser.version(),
        node: process.version,
        platform: process.platform,
        architecture: process.arch,
        engines: sources.map(source => ({
          sha256: createHash('sha256').update(source).digest('hex'),
        })),
        methodology:
          'Three default rotating rounds with a fresh native browser page per engine. One retained engine and a 24-child anchor. Whole-page retained JS heap after four forced GCs at each stage: initialized, 512 distinct plans, 8192 additional plans, another 8192 plans, detached anchor, explicit cache clear. WeakRefs check the removed anchor and child after crossing task boundaries. Shared code and DOM are included, so stage differences are more useful than absolute totals. Allocation sampling covers 10000 warmed existence queries before churn, including collected objects. Sampling estimates allocated bytes and is not an exact allocation count. No rendering is measured.',
        rounds,
        samples,
      },
      null,
      2,
    ) + '\n',
  )
  console.log(`Wrote ${values.output}`)
} finally {
  await browser.close()
}
