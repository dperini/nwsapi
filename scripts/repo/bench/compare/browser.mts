import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { rolldown } from 'rolldown'
import { chromium } from '@playwright/test'
import type factory from '../../../../dist/nwsapi.js'
import { fixture, selectors } from './fixture.mts'
import { options, metadata, writeReport } from './options.mts'
import type { compareTiming } from './timing.mts'
import { profileBrowserMemory } from './browser-memory.mts'

export interface BrowserHost {
  NW: { Dom: ReturnType<typeof factory> }
  engines: Array<ReturnType<typeof factory>>
  queries: Array<() => ArrayLike<Element>>
  expected: Element[]
  gc?: () => void
  __mitataComparison: { compareTiming: typeof compareTiming }
}

const config = options()
const require = createRequire(import.meta.url)
const bundle = await rolldown({
  input: 'scripts/repo/bench/compare/timing.mts',
  platform: 'browser',
  resolve: { alias: { mitata: require.resolve('mitata/src/lib.mjs') } },
})
let measurementCode: string
try {
  const { output } = await bundle.generate({
    format: 'iife',
    name: '__mitataComparison',
    codeSplitting: false,
  })
  if (
    output.length !== 1 ||
    output[0]?.type !== 'chunk' ||
    output[0].imports.length
  ) {
    throw new Error('Expected standalone measurement bundle')
  }
  measurementCode = output[0].code
} finally {
  await bundle.close()
}
const sources = config.paths.map(p => readFileSync(p, 'utf8'))
const browser = await chromium.launch({
  args:
    config.mode === 'memory'
      ? ['--js-flags=--expose-gc', '--enable-precise-memory-info']
      : [],
})
const rows = []
try {
  for (const matches of config.counts) {
    const page = await browser.newPage()
    try {
      await page.route('https://nwsapi.test/**', route =>
        route.fulfill({
          contentType: 'text/html',
          body: fixture(matches, config.groups, config.layout),
          headers: {
            'Cross-Origin-Opener-Policy': 'same-origin',
            'Cross-Origin-Embedder-Policy': 'require-corp',
          },
        }),
      )
      await page.goto('https://nwsapi.test/')
      if (!(await page.evaluate(() => crossOriginIsolated))) {
        throw new Error(
          'High-resolution browser timing requires cross-origin isolation',
        )
      }
      await page.addScriptTag({ content: measurementCode })
      await page.addScriptTag({ content: sources[0]! })
      await page.evaluate(() => {
        const host = window as unknown as BrowserHost
        host.engines = [host.NW.Dom]
      })
      await page.addScriptTag({ content: sources[1]! })
      await page.evaluate(() => {
        const host = window as unknown as BrowserHost
        host.engines.push(host.NW.Dom)
      })
      const session = await page.context().newCDPSession(page)
      try {
        for (const selector of selectors(config.groups)) {
          await page.evaluate(
            value => {
              const host = window as unknown as BrowserHost
              host.expected = Array.from(
                document.querySelectorAll(value.selector),
              )
              if (host.expected.length !== value.matches) {
                throw new Error('Fixture returned an unexpected match count')
              }
              host.queries = host.engines.map(
                engine => () => engine.select(value.selector, document),
              )
              for (const query of host.queries) {
                const result = query()
                if (
                  result.length !== host.expected.length ||
                  host.expected.some((node, i) => node !== result[i])
                ) {
                  throw new Error('Incorrect query results')
                }
                for (let i = 0; i < 1000; ++i) {
                  query()
                }
              }
            },
            { selector, matches },
          )
          const measurements = await page.evaluate(
            async ({ settings, mode }) => {
              const host = window as unknown as BrowserHost
              const memory = (
                performance as Performance & {
                  memory?: { usedJSHeapSize: number }
                }
              ).memory
              if (mode === 'memory' && (!host.gc || !memory)) {
                throw new Error(
                  'Memory mode requires exposed GC and precise heap info',
                )
              }
              return host.__mitataComparison.compareTiming(
                host.queries,
                settings,
                mode === 'memory'
                  ? {
                      gc: () => host.gc!(),
                      read: () =>
                        (
                          performance as Performance & {
                            memory: { usedJSHeapSize: number }
                          }
                        ).memory.usedJSHeapSize,
                    }
                  : undefined,
              )
            },
            { settings: config.settings, mode: config.mode },
          )
          const memory =
            config.mode === 'memory'
              ? await profileBrowserMemory(page, session)
              : undefined
          await page.evaluate(() => {
            const host = window as unknown as BrowserHost
            for (const query of host.queries) {
              const result = query()
              if (
                result.length !== host.expected.length ||
                host.expected.some((node, i) => node !== result[i])
              ) {
                throw new Error('Results changed during measurement')
              }
            }
          })
          rows.push({ matches, selector, measurements, memory })
        }
      } finally {
        await session.detach()
      }
    } finally {
      await page.close()
    }
  }
  writeReport(config.output, {
    ...metadata(config),
    browser: browser.version(),
    crossOriginIsolated: true,
    heapProvider:
      config.mode === 'memory'
        ? 'performance.memory.usedJSHeapSize (precise-memory-info flag), retained heap from CDP Runtime.getHeapUsage'
        : null,
    rows,
  })
} finally {
  await browser.close()
}
