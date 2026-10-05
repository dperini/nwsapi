import assert from 'node:assert/strict'
import { compileFunction } from 'node:vm'
import { createRequire } from 'node:module'
import { JSDOM } from 'jsdom'
import { chromium } from '@playwright/test'
import type { Page } from '@playwright/test'
import type { NwsapiEngine } from '../../../../.config/runtime.d.ts'
import { browserLaunchOptions } from '../../browser.mts'
import { compareTiming } from '../compare/timing.mts'
import { median, sha256 } from '../footprint/shared.mts'
import type { Fixture } from './fixtures.mts'
import type { Features } from './model.mts'
import { probeSource } from './variants.mts'

export interface Row {
  id: string
  family: string
  split: 'train' | 'holdout'
  features: Features
  fixtureSha256: string
  samples: number[][]
  calls: number[][]
  costs: number[]
}
export const settings = { rounds: 7, milliseconds: 12, batch: 16 }
type Factory = (window: unknown) => NwsapiEngine

function compile(source: string): Factory {
  const module = { exports: {} }
  compileFunction(source, ['module', 'exports', 'require'])(
    module,
    module.exports,
    createRequire(import.meta.url),
  )
  return module.exports as Factory
}

export function assertRoutes(entries: Fixture[], source = probeSource()) {
  const factory = compile(source) as Factory & {
    probes(): number
    features?(): Features
  }
  for (const entry of entries) {
    const { window } = new JSDOM(entry.html)
    try {
      const before = factory.probes()
      const engine = factory(window)
      engine.select(entry.selector, window.document)
      engine.select(entry.selector, window.document)
      if (entry.skipProbe || entry.plannerFeatures?.[1] === 0) {
        assert.equal(
          factory.probes(),
          before,
          'Expected the preflight or small-query exit: ' + entry.id,
        )
      } else {
        assert.ok(factory.probes() > before, 'Planner bypassed: ' + entry.id)
        if (factory.features) {
          assert.deepEqual(factory.features(), entry.plannerFeatures, entry.id)
        }
      }
    } finally {
      window.close()
    }
  }
}

function features(doc: Document, tags: string[]): Features {
  const count = tags.reduce(
    (sum, tag) => sum + doc.getElementsByTagName(tag).length,
    0,
  )
  const total = doc.getElementsByTagName('*').length
  return [count, total, tags.length, count / total]
}

export async function measureJsdom(entries: Fixture[], sources: string[]) {
  const factories = sources.map(compile)
  const rows: Row[] = []
  for (const entry of entries) {
    const instances = factories.map(factory => {
      const { window } = new JSDOM(entry.html)
      const engine = factory(window)
      const expected = Array.from(
        window.document.querySelectorAll(entry.selector),
      )
      const run = () => engine.select(entry.selector, window.document)
      return {
        window,
        run,
        check: () => assert.deepEqual(Array.from(run()), expected, entry.id),
      }
    })
    try {
      for (const instance of instances) {
        instance.check()
        for (let i = 0; i < 128; ++i) {
          instance.run()
        }
      }
      const result = await compareTiming(
        instances.map(instance => instance.run),
        settings,
      )
      const samples = result.map(rounds => rounds.map(round => round.p50Ns))
      rows.push({
        id: entry.id,
        family: entry.family,
        split: entry.split,
        fixtureSha256: sha256(entry.html),
        features:
          entry.plannerFeatures ||
          features(instances[0]!.window.document, entry.tags),
        samples,
        calls: result.map(rounds => rounds.map(round => round.calls)),
        costs: samples.map(median),
      })
      for (const instance of instances) {
        instance.check()
      }
    } finally {
      for (const instance of instances) {
        instance.window.close()
      }
    }
    console.log(`jsdom ${entry.id}`)
  }
  return rows
}

export async function measureBrowser(entries: Fixture[], sources: string[]) {
  const browser = await chromium.launch(browserLaunchOptions())
  const rows: Row[] = []
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
        content: `(function(){const module={exports:{}};const exports=module.exports;\n${source}\n;(globalThis.plannerFactories ||= []).push(module.exports);})();`,
      })
    }
    for (const entry of entries) {
      const result = await nativeRow(page, entry)
      rows.push({
        id: entry.id,
        family: entry.family,
        split: entry.split,
        fixtureSha256: sha256(entry.html),
        ...result,
        costs: result.samples.map(median),
      })
      console.log(`chromium ${entry.id}`)
    }
    return { rows, version: browser.version() }
  } finally {
    await browser.close()
  }
}

async function nativeRow(page: Page, fixture: Fixture) {
  return page.evaluate(
    ({ entry, timing }) => {
      if (!crossOriginIsolated) {
        throw new Error('High resolution timer requires isolation.')
      }
      const factories = (
        globalThis as unknown as { plannerFactories: Factory[] }
      ).plannerFactories
      if (factories.length < 2) {
        throw new Error('Missing comparison factories.')
      }
      const instances = factories.map(factory => {
        const frame = document.createElement('iframe')
        frame.hidden = true
        document.body.appendChild(frame)
        const doc = frame.contentDocument!
        doc.open()
        doc.write(entry.html)
        doc.close()
        const engine = factory(frame.contentWindow!)
        const expected = Array.from(doc.querySelectorAll(entry.selector))
        return {
          frame,
          doc,
          run: () => engine.select(entry.selector, doc),
          expected,
        }
      })
      const check = () => {
        for (const instance of instances) {
          const result = Array.from(instance.run())
          if (
            result.length !== instance.expected.length ||
            result.some((node, i) => node !== instance.expected[i])
          ) {
            throw new Error('Ordered identity mismatch: ' + entry.id)
          }
        }
      }
      const samples: number[][] = factories.map(() => [])
      const calls: number[][] = factories.map(() => [])
      let consumed = 0
      try {
        check()
        for (const instance of instances) {
          for (let i = 0; i < 128; ++i) {
            consumed += instance.run().length
          }
        }
        for (let round = 0; round < timing.rounds; ++round) {
          for (let turn = 0; turn < instances.length; ++turn) {
            const index = (turn + round) % instances.length
            const run = instances[index]!.run
            let count = 0
            const start = performance.now()
            do {
              for (let i = 0; i < timing.batch; ++i) {
                consumed += run().length
              }
              count += timing.batch
            } while (performance.now() - start < timing.milliseconds)
            samples[index]!.push(((performance.now() - start) * 1e6) / count)
            calls[index]!.push(count)
          }
        }
        check()
        const doc = instances[0]!.doc
        const count = entry.tags.reduce(
          (sum, tag) => sum + doc.getElementsByTagName(tag).length,
          0,
        )
        const total = doc.getElementsByTagName('*').length
        return {
          samples,
          calls,
          features:
            entry.plannerFeatures ||
            ([count, total, entry.tags.length, count / total] as Features),
          consumed,
        }
      } finally {
        for (const instance of instances) {
          instance.frame.remove()
        }
      }
    },
    { entry: fixture, timing: settings },
  )
}
