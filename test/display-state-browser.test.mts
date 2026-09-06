const __dirname = import.meta.dirname
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
import path from 'node:path'
import { test } from 'vitest'
const { chromium } = require('@playwright/test')
const source = readFileSync(path.resolve(__dirname, '../src/nwsapi.js'), 'utf8')

test.skipIf(!process.env.NWSAPI_BROWSER)(
  'browser state stays live across factory shapes, documents, and install()',
  async t => {
    const browser = await chromium.launch()
    t.onTestFinished(() => browser.close())
    for (const mode of [
      'script',
      'document',
      'window',
      'install-before',
      'install-after',
    ]) {
      await (async () => {
        const page = await browser.newPage()
        try {
          await page.setContent(
            '<!doctype html><dialog></dialog><div popover></div><iframe></iframe>',
          )
          const browserResults = await page.evaluate(
            ({ source: browserSource, mode: browserMode }) => {
              // oxlint-disable-next-line typescript/unbound-method -- Called with its element receiver below.
              const native = Element.prototype.matches
              let nw
              if (browserMode === 'document' || browserMode === 'window') {
                const module = {
                  exports: {} as (host: unknown) => typeof NW.Dom,
                }
                // oxlint-disable-next-line typescript/no-implied-eval -- Exercise the published CommonJS bootstrap in a browser realm.
                new Function('module', 'exports', browserSource)(
                  module,
                  module.exports,
                )
                nw = module.exports(
                  browserMode === 'window'
                    ? window
                    : { document, DOMException },
                )
              } else {
                // eslint-disable-next-line no-eval -- Exercise the built browser-global bootstrap.
                ;(0, eval)(browserSource)
                nw = NW.Dom
              }
              const other = document.querySelector('iframe').contentDocument
              other.body.innerHTML = '<dialog></dialog><div popover></div>'
              const pairs = [document, other].map(
                doc =>
                  [
                    doc.querySelector('dialog'),
                    doc.querySelector<HTMLElement>('[popover]'),
                  ] as const,
              )
              if (browserMode === 'install-before') {
                nw.install()
              }
              const results = []
              function check() {
                for (let i = 0; i < 3; i++) {
                  for (const [dialog, popover] of pairs) {
                    results.push([
                      nw.match(':modal', dialog),
                      native.call(dialog, ':modal'),
                    ])
                    results.push([
                      nw.match(':popover-open', popover),
                      native.call(popover, ':popover-open'),
                    ])
                  }
                }
              }
              check()
              if (browserMode === 'install-after') {
                nw.install()
              }
              for (const [dialog, popover] of pairs) {
                dialog.showModal()
                popover.showPopover()
              }
              check()
              for (const [dialog, popover] of pairs) {
                dialog.close()
                popover.hidePopover()
              }
              check()
              return results
            },
            { source, mode },
          )
          assert.ok(browserResults.some(([, expected]) => expected === true))
          for (const [actual, expected] of browserResults) {
            assert.equal(actual, expected)
          }
        } finally {
          await page.close()
        }
      })()
    }
  },
)
