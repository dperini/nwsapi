import { browserLaunchOptions } from '../browser.mts'
import { createRequire } from 'node:module'
import { JSDOM } from 'jsdom'
import { compareTiming } from './compare/timing.mts'
import type factory from '../../../dist/nwsapi.js'
import { readFileSync, writeFileSync } from 'node:fs'
import { parseArgs } from 'node:util'
import { chromium } from '@playwright/test'
import { components, documentation } from './documents.mts'
import { nativePage, nativeSources } from './native-host.mts'
import type { NativeContext, NativeGlobals } from './native-host.mts'
import { nativeTiming } from './native-timing.mts'
import { provenance, sha256 } from './footprint-shared.mts'

const { values } = parseArgs({
  options: {
    baseline: { type: 'string' },
    output: {
      type: 'string',
      default: 'assets/repo/bench/close-comparisons.json',
    },
    profile: { type: 'boolean', default: false },
    node: { type: 'boolean', default: false },
  },
})
const workloads = [
  {
    fixture: 'components',
    html: components(),
    selectors: [
      'input:read-write',
      'input:read-only',
      ':where(.card) > button',
      '.card > :is(button, input)',
    ],
  },
  {
    fixture: 'documentation',
    html: documentation(),
    selectors: ['div.example > p > a', 'dl dd a'],
  },
]
const sources = await nativeSources()
let baselineSha256: string | undefined
if (values.baseline) {
  const baseline = readFileSync(values.baseline, 'utf8')
  baselineSha256 = sha256(baseline)
  sources.competitor = `(function(){const module={exports:{}};const exports=module.exports;${baseline}
    globalThis.__competitor={DOMSelector:class {constructor(window){this.engine=module.exports(window)}querySelectorAll(selector,document){return this.engine.select(selector,document)}querySelector(selector,document){return this.engine.first(selector,document)}}};
  })();`
}
if (values.node) {
  if (!values.baseline) {
    throw new Error('Node comparison requires --baseline')
  }
  const require = createRequire(import.meta.url)
  const factories: Array<typeof factory> = [
    require('../../../dist/nwsapi.js'),
    require(values.baseline),
  ]
  const rows = []
  for (const workload of workloads) {
    const contexts = factories.map(create => {
      const dom = new JSDOM(workload.html)
      return { dom, engine: create(dom.window) }
    })
    try {
      for (const selector of workload.selectors) {
        const queries = contexts.map(
          ({ dom, engine }) =>
            () =>
              engine.select(selector, dom.window.document),
        )
        for (let index = 0; index < contexts.length; ++index) {
          const expected = Array.from(
            contexts[index]!.dom.window.document.querySelectorAll(selector),
          )
          const actual = queries[index]!()
          if (
            actual.length !== expected.length ||
            expected.some((node, i) => node !== actual[i])
          ) {
            throw new Error('Node comparison mismatch: ' + selector)
          }
          for (let i = 0; i < 100; ++i) {
            queries[index]!()
          }
        }
        const samples = await compareTiming(queries, {
          rounds: 9,
          milliseconds: 50,
          batch: 16,
        })
        rows.push({ selector, fixture: workload.fixture, samples })
      }
    } finally {
      for (const context of contexts) {
        context.dom.window.close()
      }
    }
  }
  writeFileSync(
    values.output,
    JSON.stringify({
      metadata: {
        ...provenance(),
        baselineSha256,
        host: 'jsdom direct engine control',
        labels: ['nwsapi candidate', 'nwsapi baseline'],
      },
      rows,
    }) + '\n',
  )
} else {
  const browser = await chromium.launch(browserLaunchOptions())
  const rows = []
  const profiles = []
  try {
    for (const workload of workloads) {
      const page = await nativePage(browser, sources)
      try {
        if (values.profile) {
          const session = await page.context().newCDPSession(page)
          await session.send('Profiler.enable')
          await session.send('Profiler.setSamplingInterval', { interval: 100 })
          for (const selector of workload.selectors) {
            await page.evaluate(
              ({ html, selector: query }) => {
                const host = window as unknown as NativeGlobals & {
                  __profileContext: NativeContext
                }
                host.__profileContext = host.__createContext(html, 0)
                for (let i = 0; i < 500; ++i) {
                  host.__profileContext.all(query)
                }
              },
              { html: workload.html, selector },
            )
            await session.send('Profiler.start')
            await page.evaluate(query => {
              const host = window as unknown as NativeGlobals & {
                __profileContext: NativeContext
              }
              const end = performance.now() + 1000
              while (performance.now() < end) {
                host.__profileContext.all(query)
              }
            }, selector)
            const { profile } = await session.send('Profiler.stop')
            profiles.push({ fixture: workload.fixture, selector, profile })
            await page.evaluate(() => {
              const host = window as unknown as NativeGlobals & {
                __profileContext?: NativeContext
              }
              host.__profileContext!.frame.remove()
              delete host.__profileContext
            })
          }
          await session.detach()
        }
        const result = await nativeTiming(page, {
          html: workload.html,
          selectors: workload.selectors.map(selector => ({
            category: workload.fixture,
            selector,
          })),
          rounds: 9,
          iterations: 1000,
          minRoundMs: 50,
          first: false,
          coldCount: 1,
        })
        if (result.rows.some(row => row.errors.some(Boolean))) {
          throw new Error('Incorrect results in close comparison.')
        }
        rows.push(...result.rows)
      } finally {
        await page.close()
      }
    }
    writeFileSync(
      values.output,
      JSON.stringify({
        metadata: {
          ...provenance(),
          browser: browser.version(),
          baselineSha256,
          labels: [
            'nwsapi candidate',
            values.baseline ? 'nwsapi baseline' : '@asamuzakjp/dom-selector',
          ],
          fixtures: workloads.map(workload => ({
            name: workload.fixture,
            sha256: sha256(workload.html),
          })),
        },
        rows,
        profiles,
      }) + '\n',
    )
  } finally {
    await browser.close()
  }
}
