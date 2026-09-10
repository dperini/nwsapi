import { browserLaunchOptions } from '../../../scripts/repo/browser.mts'
import type * as NodeFs from 'node:fs'
import type * as Playwright from '@playwright/test'
const __dirname = import.meta.dirname
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
import assert from 'node:assert/strict'
const { readFileSync } = require('node:fs') as typeof NodeFs
import path from 'node:path'
import { test } from 'vitest'
import type { NwsapiEngine } from '../../../.config/runtime'
const { chromium } = require('@playwright/test') as typeof Playwright
const source = readFileSync(
  path.resolve(__dirname, '../../../dist/nwsapi.js'),
  'utf8',
)

test.skipIf(!process.env['NWSAPI_BROWSER'])(
  'browser state stays live across factory shapes, documents, and install()',
  async t => {
    const browser = await chromium.launch(browserLaunchOptions())
    t.onTestFinished(() => browser.close())
    for (const mode of [
      'script',
      'document',
      'window',
      'install-before',
      'install-after',
    ] as const) {
      await (async () => {
        const page = await browser.newPage()
        try {
          await page.setContent(
            '<!doctype html><dialog aria-modal="true"></dialog><div popover aria-modal="true"></div><details open aria-modal="true"></details><div role="dialog" aria-modal="true"></div><iframe></iframe>',
          )
          const browserResults = await page.evaluate(
            ({ source: browserSource, mode: browserMode }) => {
              // oxlint-disable-next-line typescript/unbound-method -- Called with its element receiver below.
              const native = Element.prototype.matches
              let nw: NwsapiEngine
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
              const other = document.querySelector('iframe')!.contentDocument
              other!.body.innerHTML = '<dialog></dialog><div popover></div>'
              const pairs = [document, other].map(
                doc =>
                  [
                    doc!.querySelector('dialog'),
                    doc!.querySelector<HTMLElement>('[popover]'),
                  ] as const,
              )
              if (browserMode === 'install-before') {
                nw.install()
              }
              const results: Array<[boolean, boolean]> = []
              function check() {
                for (let i = 0; i < 3; i++) {
                  for (const [dialog, popover] of pairs) {
                    results.push([
                      nw.match(':modal', dialog!),
                      native.call(dialog, ':modal'),
                    ])
                    results.push([
                      nw.match(':modal', popover!),
                      native.call(popover, ':modal'),
                    ])
                    results.push([
                      nw.match(':popover-open', popover!),
                      native.call(popover, ':popover-open'),
                    ])
                  }
                }
              }
              for (const node of document.querySelectorAll('[aria-modal]')) {
                Object.defineProperty(node, 'modal', { value: true })
                results.push([
                  nw.match(':modal', node),
                  native.call(node, ':modal'),
                ])
              }
              check()
              for (const [dialog] of pairs) {
                dialog!.show()
              }
              check()
              for (const [dialog] of pairs) {
                dialog!.close()
                dialog!.setAttribute('aria-modal', 'false')
              }
              if (browserMode === 'install-after') {
                nw.install()
              }
              for (const [dialog, popover] of pairs) {
                dialog!.showModal()
                popover!.showPopover()
              }
              check()
              for (const [dialog, popover] of pairs) {
                dialog!.close()
                popover!.hidePopover()
              }
              check()
              return results
            },
            { source, mode },
          )
          assert.ok(browserResults.some(([, expected]) => expected))
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

test.skipIf(!process.env['NWSAPI_BROWSER'])(
  'modal and fullscreen matching preserve hidden browser state',
  async t => {
    const browser = await chromium.launch(browserLaunchOptions())
    t.onTestFinished(() => browser.close())
    const page = await browser.newPage()
    await page.setContent(
      '<!doctype html><dialog></dialog><div id="host"></div>',
    )
    const results = await page.evaluate(async browserSource => {
      // eslint-disable-next-line no-eval -- Exercise the published browser entry.
      ;(0, eval)(browserSource)
      const comparisons: Array<[boolean, boolean]> = []
      const check = (node: Element, selector: string) => {
        comparisons.push([NW.Dom.match(selector, node), node.matches(selector)])
      }
      const dialog = document.querySelector('dialog')!
      dialog.showModal()
      dialog.removeAttribute('open')
      check(dialog, ':modal')
      dialog.setAttribute('open', '')
      dialog.close()
      const host = document.querySelector('#host')!
      const root = host.attachShadow({ mode: 'closed' })
      const target = document.createElement('div')
      root.append(target)
      await target.requestFullscreen()
      for (const node of [host, target, dialog]) {
        check(node, ':fullscreen')
        check(node, ':modal')
      }
      await document.exitFullscreen()
      check(target, ':fullscreen')
      check(target, ':modal')
      return comparisons
    }, source)
    for (const [actual, expected] of results) {
      assert.equal(actual, expected)
    }
  },
)
