import { readFileSync, writeFileSync } from 'node:fs'
import { chromium } from '@playwright/test'

const browser = await chromium.launch(
  process.argv[2] ? { executablePath: process.argv[2] } : {},
)
try {
  const page = await browser.newPage()
  await page.setContent('<x-state></x-state>')
  await page.addScriptTag({ content: readFileSync('dist/nwsapi.js', 'utf8') })
  const rows = await page.evaluate(async () => {
    const engine = NW.Dom
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
    states!.add('initial')
    const compare = (selector: string) => {
      const native = Array.from(document.querySelectorAll(selector))
      const actual = engine.select(selector, document)
      if (
        native.length !== actual.length ||
        native.some((node, i) => node !== actual[i])
      ) {
        throw new Error('Browser mismatch: ' + selector)
      }
      return { selector, matches: actual.length }
    }
    const output = [compare('::column'), compare(':state(initial)')]
    const transition = document.startViewTransition({
      update: () => {},
      types: ['two'],
    })
    await transition.ready
    output.push(compare(':active-view-transition-type(one, two)'))
    transition.skipTransition()
    await transition.finished
    output.push(compare(':active-view-transition-type(one, two)'))
    states!.delete('initial')
    output.push(compare(':state(initial)'))
    return output
  })
  writeFileSync(
    'assets/repo/bench/bounded-browser-syntax.json',
    JSON.stringify({ browser: browser.version(), rows }, null, 2) + '\n',
  )
} finally {
  await browser.close()
}
