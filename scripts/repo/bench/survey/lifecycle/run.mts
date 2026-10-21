import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { setImmediate } from 'node:timers/promises'
import { parseArgs } from 'node:util'
import { gzipSync } from 'node:zlib'
import { JSDOM } from 'jsdom'
import { chromium } from '@playwright/test'
import { browserLaunchOptions } from '../../../browser.mts'
import { isMainModule } from '../../../lib/run-node.mts'
import { DOCUMENTS } from '../../documents.mts'
import { positiveInteger, provenance, sha256 } from '../../footprint/shared.mts'
import { checkedPower } from '../../planner/has/power.mts'
import { compile } from '../../planner/measure.mts'
import { readBundle } from '../type-union.mts'
import { lifecycleBrowserSource, measureLifecycle } from './measure.mts'
import type { LifecycleMode, LifecycleTiming } from './measure.mts'

export const lifecycleDescription = {
  operation: 'Compare warm, mutated, and first-query costs on a prepared DOM.',
  inputs: [
    '--baseline <bundle>',
    '--candidate <bundle>',
    '--output <new-directory>',
  ],
  output:
    'Exact bundles, fixture, provenance, and raw timing rounds in the output directory.',
  cold: 'Fresh engine first select. Excludes engine construction and DOM parsing.',
  mutation: 'Each timed cycle includes a mutation and a complete select query.',
}

export function parseLifecycleOptions(args: string[]) {
  const { values } = parseArgs({
    args,
    options: {
      baseline: { type: 'string' },
      candidate: { type: 'string' },
      output: { type: 'string' },
      repeat: { type: 'boolean', default: false },
      rounds: { type: 'string', default: '9' },
      json: { type: 'boolean', default: false },
      describe: { type: 'boolean', default: false },
      'dry-run': { type: 'boolean', default: false },
    },
  })
  if (values.describe) {
    return { describe: true as const }
  }
  if (!values.baseline || !values.candidate || !values.output) {
    throw new Error(
      'Pass --baseline <bundle> --candidate <bundle> --output <new-directory>.',
    )
  }
  return {
    describe: false as const,
    baseline: path.resolve(values.baseline),
    candidate: path.resolve(values.candidate),
    output: path.resolve(values.output),
    repeat: values.repeat,
    rounds: positiveInteger(values.rounds, 'rounds', 100),
    json: values.json,
    dryRun: values['dry-run'],
  }
}

export function lifecycleFixture() {
  const dom = new JSDOM(DOCUMENTS.documentation.html())
  const components = new JSDOM(DOCUMENTS.components.html())
  try {
    for (const child of Array.from(components.window.document.body.children)) {
      dom.window.document.body.append(child)
    }
    return dom.serialize()
  } finally {
    components.window.close()
    dom.window.close()
  }
}

export const lifecycleSelectors = [
  'a',
  'dl dd a',
  'dl dd :where(a, code)',
  '[data-testid]',
  '.card',
  'div.card',
]
export const lifecycleModes: LifecycleMode[] = [
  'warm',
  'attribute',
  'class',
  'child',
  'cold',
]

export async function runLifecycleSurvey(
  options: Exclude<
    ReturnType<typeof parseLifecycleOptions>,
    { describe: true }
  >,
) {
  checkedPower()
  if (existsSync(options.output)) {
    throw new Error('Use a new lifecycle output directory.')
  }
  const labels = ['baseline', 'candidate']
  const sources = [readBundle(options.baseline), readBundle(options.candidate)]
  const selectors = [...lifecycleSelectors]
  const modes = [...lifecycleModes]
  if (options.repeat) {
    labels.reverse()
    sources.reverse()
    selectors.reverse()
    modes.reverse()
  }
  const html = lifecycleFixture()
  const timing: LifecycleTiming = {
    rounds: options.rounds,
    milliseconds: 24,
    batch: 16,
    coldCalls: 16,
    warmups: 64,
  }
  const metadata = {
    ...provenance(),
    labels,
    variants: sources.map(sha256),
    fixtureSha256: sha256(html),
    repeat: options.repeat,
    settings: timing,
    method: lifecycleDescription,
  }
  mkdirSync(options.output)
  writeFileSync(path.join(options.output, 'fixture.html.gz'), gzipSync(html))
  for (const [index, source] of sources.entries()) {
    writeFileSync(
      path.join(options.output, `${labels[index]}.cjs.gz`),
      gzipSync(source),
    )
  }
  for (const host of ['chromium', 'jsdom'] as const) {
    const powerBefore = checkedPower()
    const startedAt = new Date().toISOString()
    const result =
      host === 'chromium'
        ? await measureChromiumLifecycle(
            sources,
            html,
            selectors,
            modes,
            timing,
          )
        : {
            version: metadata.jsdom,
            rows: await measureJsdomLifecycle(
              sources,
              html,
              selectors,
              modes,
              timing,
            ),
          }
    writeFileSync(
      path.join(options.output, `${host}.json`),
      JSON.stringify(
        {
          metadata: {
            ...metadata,
            host,
            version: result.version,
            powerBefore,
            powerAfter: checkedPower(),
            startedAt,
            finishedAt: new Date().toISOString(),
          },
          rows: result.rows,
        },
        null,
        2,
      ) + '\n',
    )
  }
  return { output: options.output }
}

export async function measureJsdomLifecycle(
  sources: string[],
  html: string,
  selectors: string[],
  modes: LifecycleMode[],
  timing: LifecycleTiming,
) {
  const factories = sources.map(compile)
  const rows = []
  for (const selector of selectors) {
    for (const mode of modes) {
      const windows = factories.map(() => new JSDOM(html).window)
      try {
        const worlds = windows.map((window, index) => ({
          doc: window.document,
          create: () => factories[index]!(window),
        }))
        rows.push({
          id: `${mode}/${selector}`,
          family: mode,
          selector,
          ...measureLifecycle(worlds, selector, mode, timing),
        })
      } finally {
        for (const window of windows) {
          window.close()
        }
      }
      await setImmediate()
      console.error(`jsdom ${mode}/${selector}`)
    }
  }
  return rows
}

export async function measureChromiumLifecycle(
  sources: string[],
  html: string,
  selectors: string[],
  modes: LifecycleMode[],
  timing: LifecycleTiming,
) {
  const browser = await chromium.launch(browserLaunchOptions())
  const rows = []
  try {
    const page = await browser.newPage()
    await page.route('https://planner.test/**', route =>
      route.fulfill({
        body: '<!doctype html><body></body>',
        contentType: 'text/html',
        headers: {
          'Cross-Origin-Opener-Policy': 'same-origin',
          'Cross-Origin-Embedder-Policy': 'require-corp',
        },
      }),
    )
    await page.goto('https://planner.test/')
    for (const source of sources) {
      await page.addScriptTag({
        content: `(function(){const module={exports:{}};const exports=module.exports;\n${source}\n;(globalThis.lifecycleFactories ||= []).push(module.exports)})()`,
      })
    }
    await page.addScriptTag({ content: lifecycleBrowserSource() })
    for (const selector of selectors) {
      for (const mode of modes) {
        const result = await page.evaluate(
          input => {
            if (!crossOriginIsolated) {
              throw new Error('High resolution timer requires isolation.')
            }
            const runtime = globalThis as unknown as {
              lifecycleFactories: Array<ReturnType<typeof compile>>
              measureLifecycle: typeof measureLifecycle
            }
            const frames: HTMLIFrameElement[] = []
            try {
              const worlds = runtime.lifecycleFactories.map(create => {
                const frame = document.createElement('iframe')
                frame.hidden = true
                document.body.append(frame)
                frames.push(frame)
                const doc = frame.contentDocument!
                doc.open()
                doc.write(input.html)
                doc.close()
                return { doc, create: () => create(frame.contentWindow!) }
              })
              return runtime.measureLifecycle(
                worlds,
                input.selector,
                input.mode,
                input.timing,
              )
            } finally {
              for (const frame of frames) {
                frame.remove()
              }
            }
          },
          { html, selector, mode, timing },
        )
        rows.push({
          id: `${mode}/${selector}`,
          family: mode,
          selector,
          ...result,
        })
        console.error(`chromium ${mode}/${selector}`)
      }
    }
    return { rows, version: browser.version() }
  } finally {
    await browser.close()
  }
}

export async function lifecycleMain(args: string[]) {
  const options = parseLifecycleOptions(args)
  return options.describe
    ? lifecycleDescription
    : options.dryRun
      ? { ...lifecycleDescription, ...options }
      : await runLifecycleSurvey(options)
}

if (isMainModule(import.meta.url)) {
  console.log(
    JSON.stringify(await lifecycleMain(process.argv.slice(2)), null, 2),
  )
}
