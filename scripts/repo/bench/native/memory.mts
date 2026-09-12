import { browserLaunchOptions } from '../../browser.mts'
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { parseArgs } from 'node:util'
import { chromium } from '@playwright/test'
import { nativePage, nativeSources } from './host.mts'
import type { NativeGlobals } from './host.mts'
import {
  engineNames,
  kib,
  positiveInteger,
  provenance,
  sha256,
  summarize,
} from '../footprint/shared.mts'

const { values } = parseArgs({
  options: {
    count: { type: 'string', default: '40' },
    queries: { type: 'string', default: '100' },
    rounds: { type: 'string', default: '5' },
    output: {
      type: 'string',
      default: 'assets/repo/bench/memory-footprint.json',
    },
    help: { type: 'boolean' },
  },
})
if (values.help) {
  console.log(
    'Usage: pnpm run compare:memory [--count 40] [--queries 100] [--rounds 5] [--output path]',
  )
} else {
  const count = positiveInteger(values.count, 'count', 200)
  const queries = positiveInteger(values.queries, 'queries')
  const rounds = positiveInteger(values.rounds, 'rounds', 100)
  const html =
    '<!doctype html><main>' +
    Array.from(
      { length: 50 },
      (_, i) =>
        `<div class="item" data-i="${i}"><span class="label">Item ${i}</span></div>`,
    ).join('') +
    '</main>'
  const sources = await nativeSources()
  const browser = await chromium.launch(browserLaunchOptions())
  const samples: Array<
    Array<{ initialized: number; queried: number; cacheGrowth: number }>
  > = [[], []]
  try {
    for (let round = 0; round < rounds; round++) {
      for (let turn = 0; turn < 2; turn++) {
        const index = (round + turn) % 2
        const page = await nativePage(browser, sources)
        const session = await page.context().newCDPSession(page)
        await session.send('Performance.enable')
        const heap = async () => {
          for (let pass = 0; pass < 4; pass++) {
            await page.evaluate(
              () => new Promise(resolve => setTimeout(resolve, 0)),
            )
            await session.send('HeapProfiler.collectGarbage')
          }
          const { metrics } = await session.send('Performance.getMetrics')
          const value = metrics.find(
            metric => metric.name === 'JSHeapUsedSize',
          )?.value
          if (value === undefined) {
            throw new Error('Chromium did not provide retained JS heap.')
          }
          return value
        }
        try {
          await page.evaluate(
            ({ html: fixtureHtml, count: documentCount }) => {
              const host = window as unknown as NativeGlobals
              // Warm factory/module paths before allocating the measured DOMs.
              for (let engine = 0; engine < 2; engine++) {
                const warm = host.__createContext(fixtureHtml, engine)
                warm.all('.item[data-i="0"]:not(.absent) > .label')
                warm.frame.remove()
              }
              host.__retained = Array.from({ length: documentCount }, () =>
                host.__createContext(fixtureHtml, 0, false),
              )
              for (const context of host.__retained) {
                Array.from(context.document.getElementsByClassName('label'))
              }
            },
            { html, count },
          )
          const before = await heap()
          await page.evaluate(engineIndex => {
            const host = window as unknown as NativeGlobals
            for (const context of host.__retained!) {
              const inner = context.frame.contentWindow!
              const doc = context.document
              if (engineIndex === 0) {
                const instance = host.__nwsapiFactory(inner)
                context.all = selector => instance.select(selector, doc)
                context.first = selector => instance.first(selector, doc)
              } else {
                const instance = new host.__competitor.DOMSelector(inner, doc)
                context.all = selector =>
                  instance.querySelectorAll(selector, doc)
                context.first = selector =>
                  instance.querySelector(selector, doc)
              }
            }
          }, index)
          const initialized = await heap()
          await page.evaluate(queryCount => {
            const host = window as unknown as NativeGlobals
            for (const context of host.__retained!) {
              const labels = Array.from(
                context.document.getElementsByClassName('label'),
              )
              for (let i = 0; i < queryCount; i++) {
                const result = context.all(
                  `.item[data-i="${i % 50}"]:not(.absent${i}) > .label`,
                )
                if (result.length !== 1 || result[0] !== labels[i % 50]) {
                  throw new Error('Incorrect memory-comparison query result.')
                }
              }
            }
          }, queries)
          const queried = await heap()
          if (
            (await page.evaluate(
              () => (window as unknown as NativeGlobals).__retained!.length,
            )) !== count
          ) {
            throw new Error('Lost measurement roots.')
          }
          samples[index]!.push({
            initialized: (initialized - before) / count,
            queried: (queried - before) / count,
            cacheGrowth: (queried - initialized) / count,
          })
        } finally {
          await page.close()
        }
      }
      console.log(`Standalone engine memory: round ${round + 1}/${rounds}`)
    }
    const { jsdom: _jsdom, ...sourceMetadata } = provenance()
    const report = {
      metadata: {
        ...sourceMetadata,
        runtime: `Chromium ${browser.version()}`,
        host: 'native browser DOM; no jsdom',
        count,
        queries,
        rounds,
        fixtureSha256: sha256(html),
        competitorBundleSha256: sources.competitorBundleSha256,
        method:
          'Incremental retained JS heap per engine after forced GC. DOMs and both loaded libraries exist before baseline. Fresh browser page per engine and round; rotating order. Excludes DOM allocation, shared code, native browser memory and jsdom entirely.',
      },
      rows: engineNames.map((engine, i) => ({
        engine,
        initialized: summarize(samples[i]!.map(sample => sample.initialized)),
        queried: summarize(samples[i]!.map(sample => sample.queried)),
        cacheGrowth: summarize(samples[i]!.map(sample => sample.cacheGrowth)),
      })),
    }
    const output = path.resolve(values.output)
    mkdirSync(path.dirname(output), { recursive: true })
    writeFileSync(output, JSON.stringify(report, null, 2) + '\n')
    for (const row of report.rows) {
      console.log(
        `${row.engine}: ${kib(row.initialized.median)} initialized; ${kib(row.queried.median)} after ${queries} queries`,
      )
    }
  } finally {
    await browser.close()
  }
}
