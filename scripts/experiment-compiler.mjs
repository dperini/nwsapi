// Isolated prototypes, deliberately not enabled in the public compiler.
// Usage: node scripts/experiment-compiler.mjs [report.json] [source.js]
import { readFileSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { chromium, firefox, webkit } from 'playwright'
import { launchCompilerBrowser } from './lib/compiler-browser.mjs'

const sourcePath = process.argv[3] || new URL('../src/nwsapi.js', import.meta.url)
const source = readFileSync(sourcePath, 'utf8')
const report = { date: new Date().toISOString(), source: String(sourcePath), sourceSHA256: createHash('sha256').update(source).digest('hex'), units: 'milliseconds per batch', engines: [] }
for (const [name, type] of Object.entries({ chromium, firefox, webkit })) {
  const browser = await launchCompilerBrowser(name, type)
  try {
    const page = await browser.newPage()
    await page.setContent('<!doctype html><main></main>')
    await page.addScriptTag({ content: source })
    const results = await page.evaluate(() => {
      const engine = window.NW.Dom, rows = []
      function sample(fn) {
        const start = performance.now(); let count = 0, elapsed
        do { window.__sink = fn(); count++; elapsed = performance.now() - start } while (elapsed < 25)
        return elapsed / count
      }
      function compare(label, baseline, prototype) {
        if (baseline() !== prototype()) throw Error('incorrect prototype: ' + label)
        const samples = [[], []]
        for (let round = 0; round < 7; round++) {
          const funcs = [baseline, prototype]
          for (let j = 0; j < 2; j++) { const i = (round + j) % 2; samples[i].push(sample(funcs[i])) }
        }
        samples.forEach(values => values.sort((a, b) => a - b))
        rows.push({ label, baseline: samples[0][3], prototype: samples[1][3], speedup: samples[0][3] / samples[1][3], samples })
      }
      function reverseHas() {
        const marked = new WeakSet(), witnesses = document.getElementsByClassName('needle'), anchors = document.getElementsByClassName('card')
        for (let i = 0; i < witnesses.length; i++) {
          let node = witnesses[i].parentElement
          while (node && !marked.has(node)) { marked.add(node); node = node.parentElement }
        }
        let count = 0
        for (let i = 0; i < anchors.length; i++) if (marked.has(anchors[i])) count++
        return count
      }
      document.body.innerHTML = '<div class="card">'.repeat(250) + '<i class="needle"></i>' + '</div>'.repeat(250)
      compare('reverse has / overlapping anchors', () => engine.select('.card:has(.needle)').length, reverseHas)
      document.body.innerHTML = '<div class="card"><i class="needle"></i></div>'.repeat(250)
      compare('reverse has / disjoint hits', () => engine.select('.card:has(.needle)').length, reverseHas)
      document.body.innerHTML = '<div class="card"><i></i></div>'.repeat(250)
      compare('reverse has / disjoint misses', () => engine.select('.card:has(.needle)').length, reverseHas)

      document.body.innerHTML = '<main>' + '<i class="present alpha beta"></i>'.repeat(2000) + '</main>'
      const anchor = document.body.firstElementChild
      function hash(value) { let h = 0; for (let i = 0; i < value.length; i++) h = (h * 31 + value.charCodeAt(i)) | 0; return h >>> 0 }
      function bloom(queries) {
        const bits = new Uint32Array(16), nodes = anchor.getElementsByTagName('*')
        for (let i = 0; i < nodes.length; i++) for (const name of nodes[i].classList) {
          const h = hash(name); bits[(h >>> 5) & 15] |= 1 << (h & 31)
        }
        let hits = 0
        for (const name of queries) { const h = hash(name); if ((bits[(h >>> 5) & 15] & (1 << (h & 31))) && engine.match(':has(.' + name + ')', anchor)) hits++ }
        return hits
      }
      for (const count of [1, 32, 256]) {
        const queries = Array.from({ length: count }, (_, i) => 'missing' + i)
        compare('query-scoped Bloom / ' + count + ' misses', () => queries.reduce((sum, name) => sum + engine.match(':has(.' + name + ')', anchor), 0), () => bloom(queries))
      }

      const guards = [e => e.localName === 'section', e => e.classList.contains('needle'), e => e.getAttribute('data-x') === 'x']
      const normal = e => guards[0](e) && guards[1](e) && guards[2](e)
      function adaptive(training) {
        const fails = [0, 0, 0]
        for (const node of training) for (let i = 0; i < guards.length; i++) if (!guards[i](node)) fails[i]++
        const order = [0, 1, 2].sort((a, b) => fails[b] - fails[a])
        return Function('g', 'return e=>g[' + order[0] + '](e)&&g[' + order[1] + '](e)&&g[' + order[2] + '](e)')(guards)
      }
      document.body.innerHTML = '<section data-x="x"></section>'.repeat(200) + '<div class="needle" data-x="x"></div>'.repeat(200)
      const missesClass = Array.from(document.getElementsByTagName('section')), missesTag = Array.from(document.getElementsByTagName('div'))
      const adapted = adaptive(missesClass.slice(0, 32))
      const batch = (nodes, matcher) => nodes.reduce((n, node) => n + !!matcher(node), 0)
      compare('adaptive guards / training distribution', () => batch(missesClass, normal), () => batch(missesClass, adapted))
      compare('adaptive guards / distribution changes', () => batch(missesTag, normal), () => batch(missesTag, adapted))
      compare('adaptive guards / training overhead', () => batch(missesClass, normal), () => batch(missesClass, adaptive(missesClass.slice(0, 32))))

      // Model a minimal interpreter tier for a fixed three-guard grammar.
      // Includes tier dispatch; cold cases include closure/code creation.
      const node = document.createElement('section'); node.className = 'needle'; node.setAttribute('data-x', 'x')
      function interpreted(e) { for (const guard of guards) if (!guard(e)) return false; return true }
      function emitted() { return Function('e', 'return e.localName==="section"&&e.classList.contains("needle")&&e.getAttribute("data-x")==="x"') }
      const compiled = emitted()
      function tiered() {
        let count = 0, hot
        return e => hot ? hot(e) : ++count === 32 ? (hot = emitted())(e) : interpreted(e)
      }
      const tier = tiered()
      for (let i = 0; i < 32; i++) tier(node)
      compare('tiering / one-shot construction', () => +emitted()(node), () => +tiered()(node))
      compare('tiering / hot dispatch', () => +compiled(node), () => +tier(node))
      compare('tiering / promotion cost', () => { const f = emitted(); let n = 0; for (let i = 0; i < 64; i++) n += f(node); return n },
        () => { const f = tiered(); let n = 0; for (let i = 0; i < 64; i++) n += f(node); return n })
      return rows
    })
    report.engines.push({ name, version: browser.version(), results })
    console.log(name)
    console.table(results.map(row => ({ case: row.label, baseline_ms: row.baseline.toFixed(5), prototype_ms: row.prototype.toFixed(5), speedup: row.speedup.toFixed(2) + 'x' })))
  } finally { await browser.close() }
}
if (process.argv[2]) writeFileSync(process.argv[2], JSON.stringify(report, null, 2) + '\n')
