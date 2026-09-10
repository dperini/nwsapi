import { browserLaunchOptions } from '../../../scripts/repo/browser.mts'
import type * as Jsdom from 'jsdom'
import type * as NwsapiModule from '../../../dist/nwsapi.js'
import type * as Playwright from '@playwright/test'
import type * as NodeFs from 'node:fs'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
import assert from 'node:assert/strict'
import { test, type TestContext } from 'vitest'
const { JSDOM } = require('jsdom') as typeof Jsdom
const factory =
  require('../../../dist/nwsapi.js') as typeof NwsapiModule.default
const markup =
  '<!doctype html><body><main id="scope"><div id="a"><i id="i" class="a"><b id="b" class="b"></b></i></div><div id="c"><p id="p"></p></div><div id="d"></div></main><aside id="outside"><p></p></aside>'
const selectors = [
  'div:has(p)',
  'div:has(> p)',
  'div:has(+ div)',
  'div:has(~ div)',
  'div:has(+ .missing)',
  'div:has(~ .missing)',
  'div:has(+ div p)',
  'div:has(~ div p)',
  'div:has(~ aside)',
  'div:has(.missing, p)',
  'div:has(.missing, + div p)',
  'div:has(+ .missing, ~ div)',
  'div:has(p, + div)',
  'div:has(:scope)',
  'div:has(:scope p)',
  'div:has(> :scope)',
  'main:has(:scope > div)',
  'main:has(div :scope)',
  'div:has(:is(.a .b))',
  'html:has(+ div)',
  'html:has(~ div)',
  'div:has(> p):has(+ div)',
  'div:has(+ div):not(:has(p))',
]

function fixture(t: TestContext) {
  const { window } = new JSDOM(markup)
  t.onTestFinished(() => window.close())
  return { document: window.document, nw: factory(window) }
}

test('relative selectors retain the anchor', t => {
  const { document, nw } = fixture(t)
  for (const [selector, expected] of [
    ['div:has(+ .missing)', []],
    ['div:has(~ .missing)', []],
    ['div:has(+ div p)', ['a']],
    ['div:has(~ div p)', ['a']],
    ['div:has(.missing, + div p)', ['a']],
    ['div:has(p, + div)', ['a', 'c']],
    ['div:has(> p)', ['c']],
    ['div:has(:is(.a .b))', ['a']],
    ['html:has(+ div)', []],
    ['html:has(~ div)', []],
    ['div:has(:scope)', []],
    ['div:has(:scope p)', []],
  ] as const) {
    for (let repeat = 0; repeat < 2; repeat++) {
      assert.deepEqual(
        Array.from(nw.select(selector!, document)).map(e => e.id),
        expected,
        selector,
      )
      for (const id of ['a', 'c', 'd'] as const) {
        assert.equal(
          nw.match(selector!, document.getElementById(id)!),
          (expected as readonly string[]).includes(id),
          selector + ' ' + id,
        )
      }
    }
  }
})

test('anchor restoration after success and exceptions', t => {
  const { document, nw } = fixture(t)
  const previous = document.getElementById('d')
  nw.Snapshot.anchor = previous
  assert.deepEqual(
    Array.from(nw.select('div:has(p)', document)).map(e => e.id),
    ['c'],
  )
  assert.equal(nw.Snapshot.anchor, previous)
  for (const selector of [
    'div:has(p, :unknown)',
    'html:has(+ :unknown)',
    'div:has(, p)',
  ] as const) {
    assert.throws(
      () => nw.select(selector, document),
      { name: 'SyntaxError' },
      selector,
    )
    assert.equal(nw.Snapshot.anchor, previous)
  }
})

for (const selector of ['div:has(:has(p))', 'div:has(::before)'] as const) {
  test('reject ' + selector, t => {
    const { document, nw } = fixture(t)
    assert.throws(() => nw.select(selector, document), {
      name: 'SyntaxError',
    })
  })
}

test(
  'Chromium agreement for document, scoped, and detached queries',
  { skip: !process.env['NWSAPI_BROWSER'] },
  async () => {
    const { chromium } = require('@playwright/test') as typeof Playwright
    const { readFileSync } = require('node:fs') as typeof NodeFs
    const browser = await chromium.launch({
      ...browserLaunchOptions(),
      headless: true,
    })
    try {
      const page = await browser.newPage()
      await page.setContent(markup)
      await page.addScriptTag({
        content: readFileSync(
          require.resolve('../../../dist/nwsapi.js'),
          'utf8',
        ),
      })
      for (const query of [
        'div:has(:has(p))',
        'div:has(::before)',
        'div:has(:before)',
        'div:has(:not(:has(p)))',
        'div:has(:is(:has(p), p))',
        'div:has(:where(::before, p))',
        'div:has([data-text=":has(p)"])',
        'div:has(:is(:has(p)))',
        'div:has(p):has(span)',
      ] as const) {
        const result = await page.evaluate((selector: string) => {
          const capture = (resolve: () => ArrayLike<Element>) => {
            try {
              return { ids: Array.from(resolve(), e => e.id) }
            } catch (error) {
              return {
                error: error instanceof Error ? error.name : String(error),
              }
            }
          }
          return {
            native: capture(() => document.querySelectorAll(selector)),
            nwsapi: capture(() => NW.Dom.select(selector, document)),
          }
        }, query)
        assert.deepEqual(result.nwsapi, result.native, query)
      }
      for (const selector of selectors) {
        for (const shape of ['document', 'scoped', 'detached'] as const) {
          const result = await page.evaluate(
            ({ selector: query, shape: contextShape }) => {
              const context =
                contextShape === 'document'
                  ? document
                  : contextShape === 'scoped'
                    ? document.getElementById('scope')
                    : (document
                        .getElementById('scope')!
                        .cloneNode(true) as Element)
              return {
                native: Array.from(context!.querySelectorAll(query), e => e.id),
                nwsapi: Array.from(NW.Dom.select(query, context!)).map(
                  e => e.id,
                ),
              }
            },
            { selector, shape },
          )
          assert.deepEqual(result.nwsapi, result.native, selector + ' ' + shape)
        }
      }
    } finally {
      await browser.close()
    }
  },
)
