import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'
import { chromium } from '@playwright/test'
import { browserLaunchOptions } from '../../../browser.mts'
import type { Fixture } from '../fixtures.mts'
import { compileProbe } from '../has/evidence.mts'
import { adaptiveBundle } from './variants.mts'

interface Probe {
  (window: unknown): { select(selector: string, context: Document): Element[] }
  observations(): number[][]
  resetObservations(): void
}

export function nodeObservations(entries: Fixture[], prefix: number) {
  const factories = ['prefix-continue', 'prefix-switch'].map(
    mode =>
      compileProbe(
        adaptiveBundle(
          mode as 'prefix-continue' | 'prefix-switch',
          prefix,
          true,
        ),
      ) as unknown as Probe,
  )
  return entries.map(entry => {
    const observations = factories.map(factory => {
      const { window } = new JSDOM(entry.html)
      try {
        const engine = factory(window)
        const doc = window.document
        engine.select(entry.selector, doc)
        factory.resetObservations()
        assert.deepEqual(
          Array.from(engine.select(entry.selector, doc)),
          Array.from(doc.querySelectorAll(entry.selector)),
        )
        return structuredClone(factory.observations())
      } finally {
        window.close()
      }
    })
    assert.deepEqual(observations[0], observations[1], entry.id)
    assert.ok(observations[0]!.length <= 1, entry.id)
    return { id: entry.id, features: observations[0]![0] ?? null }
  })
}

export async function nativeObservations(entries: Fixture[], prefix: number) {
  const browser = await chromium.launch(browserLaunchOptions())
  try {
    const page = await browser.newPage()
    for (const mode of ['prefix-continue', 'prefix-switch'] as const) {
      const source = adaptiveBundle(mode, prefix, true)
      await page.addScriptTag({
        content: `(function(){var module={exports:{}};var exports=module.exports;
        ${source}\n;(globalThis.observationFactories ||= []).push(module.exports);})();`,
      })
    }
    const output = []
    for (const entry of entries) {
      const observations = await page.evaluate(fixture => {
        const factories = (
          globalThis as unknown as { observationFactories: Probe[] }
        ).observationFactories
        return factories.map(factory => {
          const frame = document.createElement('iframe')
          document.body.append(frame)
          try {
            const doc = frame.contentDocument!
            doc.open()
            doc.write(fixture.html)
            doc.close()
            const engine = factory(frame.contentWindow)
            engine.select(fixture.selector, doc)
            factory.resetObservations()
            const actual = Array.from(engine.select(fixture.selector, doc))
            const expected = Array.from(doc.querySelectorAll(fixture.selector))
            if (
              actual.length !== expected.length ||
              actual.some((e, i) => e !== expected[i])
            ) {
              throw new Error(
                'Adaptive prefix identity mismatch: ' + fixture.id,
              )
            }
            return structuredClone(factory.observations())
          } finally {
            frame.remove()
          }
        })
      }, entry)
      assert.deepEqual(observations[0], observations[1], entry.id)
      assert.ok(observations[0]!.length <= 1, entry.id)
      output.push({ id: entry.id, features: observations[0]![0] ?? null })
    }
    return output
  } finally {
    await browser.close()
  }
}
