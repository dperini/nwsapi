import { readFileSync } from 'node:fs'
import { chromium } from '@playwright/test'
import { expect, test } from 'vitest'
import { browserLaunchOptions } from '../../../scripts/repo/browser.mts'

test.skipIf(!process.env['NWSAPI_BROWSER'])(
  'compiler ports agree with Chromium across scopes, namespaces, and mutations',
  async t => {
    const browser = await chromium.launch({
      ...browserLaunchOptions(),
      headless: true,
    })
    t.onTestFinished(() => browser.close())
    const page = await browser.newPage()
    await page.setContent('<!doctype html><main></main>')
    await page.addScriptTag({
      content: readFileSync(
        new URL('../../../dist/nwsapi.js', import.meta.url),
        'utf8',
      ),
    })
    const differences = await page.evaluate(() => {
      const engine = window.NW.Dom
      const failures: string[] = []
      const selectors = [
        '.card[data-a], .card[data-b]',
        'div[data-a], div[data-b]',
        '.card:has(.witness)',
        '.card:has(.missing)',
        '.card:has(> .a + .b)',
        '.card:has(+ .card > .a)',
        '.card:has(~ .card > .b)',
        '.missing .a > .a .leaf',
        'body .a > .a .leaf',
        '.a > .a .a > .leaf',
        '.a ~ .a + .a ~ .leaf',
        ':is(main > .card > .leaf, aside .leaf)',
        ':not(main > .missing, .card > .leaf)',
        '.card.missing[data-a]:has(> .a)',
        '.card.card[data-a][data-a]',
        '[data-a="a > b"].card',
        '.card[data-a]:nth-child(2n)',
        '.card:has(.witness):not(:scope)',
        ':scope > .card',
        '.card:is(.missing,:unknown,.a)',
        '.card:has(:is(.witness,:unknown))',
      ]
      for (const left of ['.a', '.card', '.missing']) {
        for (const relation of ['>', '+', '~']) {
          selectors.push(left + ' .a ' + relation + ' .b .leaf')
        }
      }
      const markup =
        '<div class="card a" data-a="a > b">'.repeat(40) +
        '<i class="witness leaf b"></i><b class="a"></b><b class="b"></b>' +
        '</div>'.repeat(40)
      const compare = (
        context: Document | Element | DocumentFragment,
        label: string,
      ) => {
        for (const selector of selectors) {
          let expected: Element[]
          try {
            expected = Array.from(context.querySelectorAll(selector))
          } catch {
            continue
          }
          for (let repeat = 0; repeat < 2; ++repeat) {
            const actual = Array.from(engine.select(selector, context))
            if (
              actual.length !== expected.length ||
              actual.some((node, i) => node !== expected[i])
            ) {
              failures.push(label + ':select:' + selector)
            }
            if (engine.first(selector, context) !== (expected[0] || null)) {
              failures.push(label + ':first:' + selector)
            }
          }
        }
      }
      document.body.innerHTML = '<main>' + markup + '</main>'
      compare(document, 'document')
      compare(document.querySelector('.card')!, 'element')
      document.querySelector('.witness')!.remove()
      compare(document, 'mutated')
      const fragment = document.createDocumentFragment()
      fragment.append(document.querySelector('main')!)
      compare(fragment, 'fragment')
      const quirks = new DOMParser().parseFromString(markup, 'text/html')
      compare(quirks, 'quirks')
      const xml = new DOMParser().parseFromString(
        '<root xmlns:x="urn:x"><x:div class="card a" data-a="one"><div class="a"><b class="a"><i class="leaf witness"/></b></div></x:div></root>',
        'application/xml',
      )
      compare(xml, 'XML')
      return failures
    })
    expect(differences).toEqual([])
  },
)
