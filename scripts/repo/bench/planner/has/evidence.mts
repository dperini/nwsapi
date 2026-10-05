import assert from 'node:assert/strict'
import { compileFunction } from 'node:vm'
import { createRequire } from 'node:module'
import { JSDOM } from 'jsdom'
import { chromium } from '@playwright/test'
import { browserLaunchOptions } from '../../../browser.mts'
import type { Fixture } from '../fixtures.mts'
import type { Trace } from './instrument.mts'
import { referenceRoute } from './contract.mts'

interface Factory {
  (window: unknown): { select(selector: string, context: Document): Element[] }
  trace(): Trace
  resetTrace(): void
}

export interface Evidence {
  id: string
  traces: Trace[]
}

export function compileProbe(source: string) {
  const module = { exports: {} }
  compileFunction(source, ['module', 'exports', 'require'])(
    module,
    module.exports,
    createRequire(import.meta.url),
  )
  return module.exports as Factory
}

export function verifyEvidence(row: Evidence) {
  const [baseline, forward, inverse] = row.traces
  assert.ok(baseline && forward && inverse, row.id)
  if (!baseline.facts) {
    assert.equal(forward.entries + inverse.entries, 0, row.id)
    return
  }
  assert.equal(baseline.route, referenceRoute(baseline.facts), row.id)
  if (baseline.facts.anchors < 32 || baseline.facts.witnesses === 0) {
    assert.equal(forward.route, baseline.route, row.id)
    assert.equal(inverse.route, baseline.route, row.id)
    return
  }
  assert.equal(forward.route, 'forward', row.id)
  assert.equal(forward.inverse, 0, row.id)
  assert.equal(forward.resolver, 1, row.id)
  assert.equal(inverse.route, 'inverse', row.id)
  assert.equal(inverse.inverse, 1, row.id)
  assert.equal(inverse.resolver, 0, row.id)
  assert.deepEqual(forward.features, baseline.features, row.id)
  assert.deepEqual(inverse.features, baseline.features, row.id)
}

export function jsdomEvidence(
  entries: Fixture[],
  sources: string[],
  verify = verifyEvidence,
  warmCount = 1,
) {
  const factories = sources.map(compileProbe)
  return entries.map(entry => {
    const traces = factories.map(factory => {
      const { window } = new JSDOM(entry.html)
      try {
        const doc = window.document
        const engine = factory(window)
        const expected = Array.from(doc.querySelectorAll(entry.selector))
        for (let warm = 0; warm < warmCount; ++warm) {
          engine.select(entry.selector, doc)
        }
        factory.resetTrace()
        assert.deepEqual(
          Array.from(engine.select(entry.selector, doc)),
          expected,
          entry.id,
        )
        return structuredClone(factory.trace())
      } finally {
        window.close()
      }
    })
    const result = { id: entry.id, traces }
    verify(result)
    return result
  })
}

export async function browserEvidence(
  entries: Fixture[],
  sources: string[],
  verify = verifyEvidence,
  warmCount = 1,
) {
  const browser = await chromium.launch(browserLaunchOptions())
  try {
    const page = await browser.newPage()
    for (const source of sources) {
      await page.addScriptTag({
        content: `(function(){const module={exports:{}};
        const exports=module.exports;\n${source}\n;
        (globalThis.probeFactories ||= []).push(module.exports);})();`,
      })
    }
    const result: Evidence[] = []
    for (const entry of entries) {
      const traces = await page.evaluate(
        ({ fixture, warmCount: iterations }) => {
          const factories = (
            globalThis as unknown as { probeFactories: Factory[] }
          ).probeFactories
          return factories.map(factory => {
            const frame = document.createElement('iframe')
            document.body.append(frame)
            try {
              const doc = frame.contentDocument!
              doc.open()
              doc.write(fixture.html)
              doc.close()
              const engine = factory(frame.contentWindow)
              const expected = Array.from(
                doc.querySelectorAll(fixture.selector),
              )
              for (let warm = 0; warm < iterations; ++warm) {
                engine.select(fixture.selector, doc)
              }
              factory.resetTrace()
              const actual = Array.from(engine.select(fixture.selector, doc))
              if (
                actual.length !== expected.length ||
                actual.some((e, i) => e !== expected[i])
              ) {
                throw new Error(`Probe identity mismatch: ${fixture.id}`)
              }
              return structuredClone(factory.trace())
            } finally {
              frame.remove()
            }
          })
        },
        { fixture: entry, warmCount },
      )
      const row = { id: entry.id, traces }
      verify(row)
      result.push(row)
    }
    return result
  } finally {
    await browser.close()
  }
}
