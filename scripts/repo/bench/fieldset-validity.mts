import { browserLaunchOptions } from '../browser.mts'
import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { JSDOM } from 'jsdom'
import { chromium } from '@playwright/test'
import factory from '../../../dist/nwsapi.js'

const html =
  '<fieldset disabled><legend><input id=legend required value=ok></legend><input id=filled required value=ok><input id=empty required></fieldset>'
const selectors = ['input:disabled', 'input:valid', 'input:invalid']
const expected = [['filled', 'empty'], ['legend'], []]
const source = readFileSync('dist/nwsapi.js', 'utf8')
const { window } = new JSDOM(html)
try {
  const engine = factory(window)
  const ids = (nodes: ArrayLike<Element>) => Array.from(nodes, node => node.id)
  const jsdom = selectors.map((selector, index) => {
    const actual = ids(engine.select(selector, window.document))
    assert.deepEqual(actual, expected[index])
    return {
      selector,
      host: ids(window.document.querySelectorAll(selector)),
      engine: actual,
    }
  })
  const browser = await chromium.launch(browserLaunchOptions())
  try {
    const page = await browser.newPage()
    await page.setContent(html)
    await page.addScriptTag({ content: source })
    const rows = await page.evaluate(
      queries =>
        queries.map(selector => ({
          selector,
          host: Array.from(
            document.querySelectorAll(selector),
            node => node.id,
          ),
          engine: Array.from(
            NW.Dom.select(selector, document),
            node => node.id,
          ),
        })),
      selectors,
    )
    for (let index = 0; index < rows.length; ++index) {
      assert.deepEqual(rows[index]!.host, expected[index])
      assert.deepEqual(rows[index]!.engine, expected[index])
    }
    writeFileSync(
      'assets/repo/bench/fieldset-validity.json',
      JSON.stringify(
        {
          node: process.version,
          browser: browser.version(),
          engineHash: createHash('sha256').update(source).digest('hex'),
          html,
          methodology:
            'Disabled fieldset with populated and empty required inputs and a first-legend control. Compare public native and engine selection by element ID. No timing claim.',
          jsdom,
          chromium: rows,
        },
        null,
        2,
      ) + '\n',
    )
  } finally {
    await browser.close()
  }
} finally {
  window.close()
}
