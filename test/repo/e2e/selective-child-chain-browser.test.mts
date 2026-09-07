import fs from 'node:fs'
import { JSDOM } from 'jsdom'
import { chromium } from '@playwright/test'
import { expect, test } from 'vitest'
import factory from '../../../src/nwsapi.js'

test(
  'selective and positional paths agree with Chromium in both hosts',
  {
    skip: !process.env.NWSAPI_BROWSER,
  },
  async () => {
    const browser = await chromium.launch()
    try {
      const page = await browser.newPage()
      for (const doctype of ['<!doctype html>', '']) {
        const html =
          doctype +
          `<section class="anchor" id="outer"><div>
        <section class="anchor" id="inner"><div><span id="first"></span></div></section>
        <span id="second"></span></div><div><span id="third"></span></div></section>
        <section class="ANCHOR"><div><span id="upper"></span></div></section>
        <svg class="anchor"><g><path id="path"></path></g></svg>`
        await page.setContent(html)
        await page.addScriptTag({
          content: fs.readFileSync('src/nwsapi.js', 'utf8'),
        })
        const { window } = new JSDOM(html)
        try {
          const nw = factory(window)
          for (const selector of [
            '.anchor > div > span',
            'section.anchor>div>span',
            '.anchor > g > path',
            ':where(.anchor) > div',
            'div:nth-last-child(3)',
            'div:nth-child(2)',
            'span:is(#first)',
            ':is(div,span)',
            'section > :is(div,span)',
            ':where(span,div,span)',
            'section > :not(:nth-child(2))',
          ]) {
            const result = await page.evaluate(
              query => ({
                native: [...document.querySelectorAll(query)].map(e => e.id),
                engine: NW.Dom.select(query).map(e => e.id),
              }),
              selector,
            )
            expect(result.engine, selector).toEqual(result.native)
            expect(
              nw.select(selector).map(e => e.id),
              selector,
            ).toEqual(result.native)
          }
        } finally {
          window.close()
        }
      }
    } finally {
      await browser.close()
    }
  },
)
