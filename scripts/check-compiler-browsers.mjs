// Differential checks against each browser's unmodified selector APIs.
// Usage: node scripts/check-compiler-browsers.mjs [--output report.json]
import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import { chromium, firefox, webkit } from 'playwright'
import { createHash } from 'node:crypto'
import { launchCompilerBrowser } from './lib/compiler-browser.mjs'

const source = readFileSync(new URL('../src/nwsapi.js', import.meta.url), 'utf8')
const report = { date: new Date().toISOString(), sourceSHA256: createHash('sha256').update(source).digest('hex'), engines: [] }
for (const [name, browserType] of Object.entries({ chromium, firefox, webkit })) {
  const browser = await launchCompilerBrowser(name, browserType)
  try {
    const page = await browser.newPage()
    await page.setContent('<!doctype html><main></main>')
    await page.addScriptTag({ content: source })
    const result = await page.evaluate(() => {
      const engine = window.NW.Dom, failures = [], unsupported = new Set()
      let checks = 0
      const html = '<main id="Mixed" class="A a">' + Array.from({ length: 12 }, (_, i) =>
        `<section class="a ${i % 2 ? 'b' : 'c'}" data-x="${i % 2 ? 'ONE two' : ''}">` +
        '<div class="a"><i class="b leaf"></i><span class="a leaf"></span></div>' +
        '<div class="b"><i class="a leaf"></i><span class="b leaf"></span></div></section>').join('') +
        '<input type="checkbox" checked><p><!-- comment --></p><svg><g class="a"><rect class="b"/></g></svg></main>'
      const parts = ['*', 'main', 'section', 'div', 'i', '.a', '.b', '.leaf', '.missing', 'div.a', '[data-x]', '[data-x=""]', ':first-child', ':last-child', ':nth-child(2n)', ':not(.c)']
      const selectors = new Set([...parts, '#mixed', '#Mixed', '.A', '[type="CHECKBOX"]', '[data-x="one TWO" i]', '[data-x="ONE two" s]', ':root', ':scope', ':empty', '*|i', ':has(> *)', ':has(+ *)', ':has(~ *)'])
      for (const a of parts) for (const b of parts) for (const op of [' ', ' > ', ' + ', ' ~ ']) selectors.add(a + op + b)
      for (const a of parts) for (const b of ['.a', '.missing', 'div > i', 'section .leaf']) {
        for (const pseudo of ['is', 'not', 'where', 'has']) selectors.add(`${a}:${pseudo}(${b})`)
        selectors.add(`${a}, ${b}`)
      }
      for (const formula of ['n', '0n+1', '2n+1', '-n+8', '-2n+9', '3n-5', '9', '0', '-1', 'even', 'odd']) {
        for (const pseudo of ['nth-child', 'nth-last-child', 'nth-of-type', 'nth-last-of-type']) selectors.add(`*:${pseudo}(${formula})`)
      }
      for (const a of ['.a', '.missing', 'section']) for (const op of [' > ', ' + ', ' ~ ']) selectors.add(`${a} .a${op}.b .leaf`)
      selectors.add(':is(.a > .leaf, .b > .leaf)')
      selectors.add(':has(+ section > div .leaf)')
      selectors.add(':has(~ section > div + div)')
      const compare = (context, label, subset = selectors) => {
        const nodes = Array.from(context.querySelectorAll('*'))
        const encode = list => Array.from(list, node => nodes.indexOf(node)).join(',')
        for (const selector of subset) {
          let native
          try { native = context.querySelectorAll(selector) } catch { unsupported.add(selector); continue }
          const check = (api, actual, expected) => {
            checks++
            if (actual !== expected && failures.length < 50) failures.push({ label, selector, api, actual, expected })
          }
          try {
            check('select', encode(engine.select(selector, context)), encode(native))
            check('first', engine.first(selector, context) === (native[0] || null), true)
            for (const index of [0, 1, 4, 8, nodes.length - 1]) {
              const node = nodes[index]
              if (node) check('match', engine.match(selector, node), node.matches(selector))
            }
          } catch (error) { check('exception', error.message, 'no exception') }
        }
      }
      document.body.innerHTML = html
      compare(document, 'HTML')
      compare(document.querySelector('section'), 'element')
      const fragment = document.createDocumentFragment()
      const box = document.createElement('div'); box.innerHTML = html
      fragment.append(...box.childNodes); compare(fragment, 'fragment')
      const quirks = new DOMParser().parseFromString(html, 'text/html'); compare(quirks, 'quirks')
      const xml = new DOMParser().parseFromString('<R xmlns:a="urn:a" xmlns:b="urn:b">' +
        '<a:item class="a"/><b:item class="b"/>'.repeat(12) + '<Thing/><thing/><empty><!--x--></empty></R>', 'application/xml')
      compare(xml, 'XML', new Set([...selectors, 'Thing', 'thing', 'item:nth-of-type(9)', 'item:nth-last-of-type(9)']))
      // Exercise cached code after structural changes and document switches.
      document.querySelector('section').remove()
      compare(document, 'mutated', new Set(['.a', ':nth-child(9)', ':has(> .a)', '.a, .b', ':root']))
      document.body.innerHTML = '<div class="card a">'.repeat(80) + '<i class="needle leaf"></i>' + '</div>'.repeat(80)
      compare(document, 'deep', new Set(['.card:has(.needle)', '.card:has(.missing)', '.card:has(.needle):nth-child(2n+1)',
        '.missing .a > .a .a .leaf', 'body .a > .a .a .leaf', '.a > .a .a > .leaf', '.a .a > .a .leaf']))
      compare(document.body.firstElementChild, 'deep scoped', new Set(['.card:has(.needle)', '.card:has(.needle):not(:scope)']))
      return { checks, selectors: selectors.size, unsupported: [...unsupported], failures }
    })
    report.engines.push({ name, version: browser.version(), ...result })
    console.log(`${name} ${browser.version()}: ${result.checks} checks; ${result.failures.length} mismatches; ${result.unsupported.length} unsupported selectors`)
    if (result.failures.length) console.log(JSON.stringify(result.failures.slice(0, 12), null, 2))
  } finally { await browser.close() }
}
const output = process.argv.indexOf('--output')
if (output >= 0) writeFileSync(process.argv[output + 1], JSON.stringify(report, null, 2) + '\n')
assert.equal(report.engines.reduce((count, engine) => count + engine.failures.length, 0), 0, 'browser differential mismatches')
