import { readFileSync } from 'node:fs'
import { chromium } from '@playwright/test'
import { expect, test } from 'vitest'

test.skipIf(!process.env['NWSAPI_BROWSER'])(
  'custom states and shadow queries follow live changes before and after installation',
  async t => {
    const browser = await chromium.launch()
    t.onTestFinished(() => browser.close())
    for (const legacy of [false, true]) {
      const page = await browser.newPage()
      try {
        await page.setContent(
          '<main id="host"><span class="assigned"></span></main><x-state></x-state>',
        )
        await page.addScriptTag({
          content: readFileSync(
            new URL('../../../dist/nwsapi.js', import.meta.url),
            'utf8',
          ),
        })
        if (legacy) {
          await page.addScriptTag({
            content: readFileSync('dist/modules/nwsapi-legacy.js', 'utf8'),
          })
          await page.evaluate(() => NW.Dom.configure({ LEGACY: true }))
        }
        const results = await page.evaluate(() => {
          const engine = window.NW.Dom
          const element = document.querySelector('x-state')!
          let states: CustomStateSet
          customElements.define(
            'x-state',
            class extends HTMLElement {
              constructor() {
                super()
                states = this.attachInternals().states
              }
            },
          )
          const host = document.querySelector('main')!
          const assigned = host.firstElementChild!
          const root = host.attachShadow({ mode: 'open' })
          root.innerHTML = '<slot></slot>'
          const slot = root.firstElementChild!
          const values: boolean[] = []
          for (const installed of [false, true]) {
            if (installed) {
              engine.install()
            }
            states!.add('ready')
            values.push(engine.match(':state(ready)', element))
            states!.delete('ready')
            values.push(!engine.match(':state(ready)', element))
            for (const selector of [
              ':host > slot',
              ':host(#host) > slot',
              ':host-context(body) > slot',
              ':host(:is(body > main, #host)) > slot',
            ]) {
              values.push(engine.first(selector, root) === slot)
            }
            values.push(engine.first(':host > slot', document) === null)
            values.push(engine.match(':has-slotted', slot))
            assigned.remove()
            values.push(!engine.match(':has-slotted', slot))
            host.append(assigned)
          }
          return values
        })
        expect(results.every(Boolean), `legacy=${legacy}`).toBe(true)
      } finally {
        await page.close()
      }
    }
  },
)
