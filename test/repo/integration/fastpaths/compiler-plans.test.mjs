import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { test } from 'node:test'

const require = createRequire(import.meta.url)
const { JSDOM } = require('jsdom')
const source = readFileSync(process.env.NWSAPI_TEST_SOURCE || new URL('../../../../src/nwsapi.js', import.meta.url), 'utf8')
function fixture(t, html = '') {
  const { window } = new JSDOM('<!doctype html>' + html, { runScripts: 'outside-only' })
  t.after(() => window.close())
  window.eval(source)
  return { window, document: window.document, engine: window.NW.Dom }
}

test('attribute lowering preserves missing, empty, escaped and literal values', t => {
  const { engine, document } = fixture(t, '<div id="target" data-empty="" data-text="a + b"></div>')
  const node = document.getElementById('target')
  for (const selector of ['[missing="null"]', '[data-empty^=""]', '[data-empty$=""]', '[data-empty*=""]', '[data-empty~=""]']) {
    assert.equal(engine.match(selector, node), false, selector)
    assert.equal(engine.first(selector), null, selector)
  }
  for (const selector of ['[data-empty=""]', '[data-empty|=""]', '[data-text="a + b"]']) assert.equal(engine.match(selector, node), true, selector)
  node.setAttribute('data-text', 'a"b\\c')
  assert.equal(engine.match(String.raw`[data-text="a\"b\\c"]`, node), true)
  node.setAttribute('data-text', 'a,b > c ~ d')
  assert.equal(engine.match('[data-text="a,b > c ~ d"]', node), true)
})

test('case folding is ASCII-only and respects XML and foreign element namespaces', t => {
  const { engine, window, document } = fixture(t, '<div></div><input type="checkbox"><svg viewBox="0 0 1 1"></svg>')
  assert.equal(engine.match('DIV', document.getElementsByTagName('div')[0]), true)
  assert.equal(engine.match('[type="CHECKBOX"]', document.getElementsByTagName('input')[0]), true)
  assert.equal(engine.match('[type="CHECKBOX" s]', document.getElementsByTagName('input')[0]), false)
  const xml = new window.DOMParser().parseFromString('<R><Thing type="checkbox"/><thing/></R>', 'application/xml')
  assert.equal(engine.match('Thing', xml.documentElement.firstElementChild), true)
  assert.equal(engine.match('thing', xml.documentElement.firstElementChild), false)
  assert.equal(engine.match('[type="CHECKBOX"]', xml.documentElement.firstElementChild), false)
  const node = document.createElement('div'); node.setAttribute('x', 'Ä')
  assert.equal(engine.match('[x="ä" i]', node), false)
})

test('scope, foreign roots and nested queries restore the enclosing context', t => {
  const { engine, window, document } = fixture(t, '<main id="target"><i></i></main>')
  const main = document.getElementById('target')
  const xml = new window.DOMParser().parseFromString('<R><Thing/></R>', 'application/xml')
  assert.equal(engine.match(':root', xml.documentElement), true)
  assert.equal(engine.match(':scope', main), true)
  assert.equal(engine.first(':root'), document.documentElement)
  engine.registerSelector('nested', /^:nested\b(.*)/, (match, next) => ({ source: 's.nested();' + next, status: true }))
  engine.Snapshot.nested = () => engine.first('Thing', xml)
  assert.equal(engine.first(':scope > i:nested', main), main.firstElementChild)
  engine.Snapshot.nested = () => { engine.first('Thing', xml); throw new Error('nested failure') }
  assert.throws(() => engine.first('i:nested', main), /nested failure/)
  assert.equal(engine.first(':scope > i', main), main.firstElementChild)
})

test('root replacement invalidates document-dependent guards', t => {
  const { engine, window } = fixture(t)
  const xml = new window.DOMParser().parseFromString('<p:R xmlns:p="urn:one"><p:item/></p:R>', 'application/xml')
  engine.first('*', xml)
  assert.equal(engine.compile('p|item', false)(xml.documentElement.firstElementChild, null, null, false), true)
  const root = xml.createElementNS('urn:two', 'p:R')
  root.appendChild(xml.createElementNS('urn:two', 'p:item'))
  xml.replaceChild(root, xml.documentElement)
  engine.first('*', xml)
  assert.equal(engine.compile('p|item', false)(root.firstElementChild, null, null, false), true)
  assert.equal(engine.first(':root', xml), root)
})

test('fragment relative queries stay within the required sibling and child paths', t => {
  const { engine, document } = fixture(t)
  const fragment = document.createDocumentFragment()
  const anchor = document.createElement('i'), sibling = document.createElement('b')
  sibling.innerHTML = '<em class="hit"></em><em></em>'
  fragment.append(anchor, sibling, document.createElement('aside'))
  for (const selector of [':has(+ b)', ':has(+ b > em.hit)', ':has(+ b > em + em)', ':has(~ aside)']) {
    assert.equal(engine.match(selector, anchor), true, selector)
  }
  assert.equal(engine.match(':has(+ aside)', anchor), false)
  assert.equal(engine.match(':has(+ b > strong)', anchor), false)
})

test('pure compound facts eliminate redundant reads and impossible candidate lookups', t => {
  const { engine, document } = fixture(t, '<div class="a b" data-x="x"></div>')
  const node = document.getElementsByTagName('div')[0]
  let classes = 0, attributes = 0
  Object.defineProperty(node, 'className', { get() { classes++; return 'a b' } })
  const read = node.getAttribute.bind(node)
  node.getAttribute = name => { attributes++; return read(name) }
  assert.equal(engine.match('div.a.b[data-x="x"][data-x^="x"]:not(.off):is(.a,.b)', node), true)
  assert.equal(classes, 1); assert.equal(attributes, 1)
  document.getElementsByClassName = () => { throw new Error('unnecessary lookup') }
  assert.equal(engine.first('.a:not(.a)'), null)
  assert.deepEqual(Array.from(engine.select('.a:not(.a)')), [])
  assert.throws(() => engine.first('.a:not(.a), :has(:unknown)'), { name: 'SyntaxError' })
})

test('pure ancestor misses have linear work and mixed combinators preserve backtracking', t => {
  const { engine, document } = fixture(t, '<div class="a">'.repeat(30) + '<b class="leaf"></b>' + '</div>'.repeat(30))
  const leaf = document.getElementsByTagName('b')[0]
  const original = engine.Snapshot.hasClass
  let misses = 0
  engine.Snapshot.hasClass = (node, name) => { if (name === 'missing') misses++; return original(node, name) }
  assert.equal(engine.match('.missing .a .a .leaf', leaf), false)
  assert.ok(misses <= 32, String(misses))
  document.body.innerHTML = '<section class="yes"><div class="b"><article><div class="b"><i class="leaf"></i></div></article></div></section>'
  const item = document.getElementsByTagName('i')[0]
  for (const selector of ['.yes > .b .leaf', '.yes > .b > article .leaf', 'section div > article .b > .leaf']) assert.equal(engine.match(selector, item), true, selector)
  assert.equal(engine.match('.missing > .b .leaf', item), false)
})

test('first lists and multi-class seeds stop without copying full collections', t => {
  const { engine, document } = fixture(t, '<i class="a b"></i>' + '<i class="a"></i>'.repeat(50))
  const first = document.getElementsByTagName('i')[0]
  const read = document.getElementsByClassName.bind(document)
  let reads = 0, seeds = []
  document.getElementsByClassName = name => {
    seeds.push(name)
    return new Proxy(read(name), { get(target, key) {
      if (/^\d+$/.test(String(key))) reads++
      return Reflect.get(target, key, target)
    } })
  }
  assert.equal(engine.first('.a, .b'), first)
  assert.ok(reads <= 4, String(reads))
  reads = 0; seeds = []
  assert.equal(engine.first('.a.b'), first)
  assert.deepEqual(seeds, ['a b'])
  assert.ok(reads <= 2)
})

test('selection caches retain plans rather than result arrays or contexts', t => {
  const { engine, document } = fixture(t, '<i class="gone"></i>')
  const result = engine.select('.gone', document)
  const node = result[0]; node.remove()
  assert.equal(engine.select('.gone', document).length, 0)
  const resolver = engine.selectResolvers.get('.gone')
  assert.equal(Object.hasOwn(resolver, 'results'), false)
  assert.equal(Object.hasOwn(resolver, 'context'), false)
  assert.equal(Object.hasOwn(resolver, 'htmlset'), false)
})

test('small nth positions use bounded walks without sibling caches', t => {
  const { engine, document } = fixture(t, '<main>' + '<i></i>'.repeat(20) + '</main>')
  const items = document.getElementsByTagName('i')
  engine.Snapshot.nthElement = () => { throw new Error('allocated sibling cache') }
  for (let n = 1; n <= 8; n++) {
    assert.equal(engine.match(':nth-child(' + n + ')', items[n - 1]), true)
    assert.equal(engine.match(':nth-last-child(' + n + ')', items[20 - n]), true)
  }
  assert.equal(engine.match(':nth-child(0)', items[0]), false)
})

test('nth type positions distinguish namespaces and fragment parents', t => {
  const { engine, document } = fixture(t)
  const fragment = document.createDocumentFragment(), typed = []
  for (let i = 0; i < 12; i++) {
    const node = document.createElementNS('urn:a', 'item'); typed.push(node)
    fragment.append(node, document.createElementNS('urn:b', 'item'))
  }
  assert.equal(engine.match(':nth-of-type(9)', typed[8]), true)
  assert.equal(engine.match(':nth-last-of-type(9)', typed[3]), true)
  assert.equal(engine.match(':nth-child(17)', typed[8]), true)
  assert.equal(engine.select('item:nth-of-type(9)', fragment).length, 2)
})

test('mixed combinator backtracking memoizes repeated states within one query', t => {
  const { engine, document } = fixture(t, '<div class="a">'.repeat(40) + '<b class="leaf"></b>' + '</div>'.repeat(40))
  const leaf = document.getElementsByTagName('b')[0], original = engine.Snapshot.hasClass
  let misses = 0
  engine.Snapshot.hasClass = (node, name) => { if (name === 'missing') misses++; return original(node, name) }
  const selector = '.missing .a > .a .a .leaf'
  assert.equal(engine.match(selector, leaf), false)
  assert.ok(misses <= 2 * 40 + 64, String(misses))
  document.body.firstElementChild.className += ' missing'
  assert.equal(engine.match(selector, leaf), true)
  assert.equal(engine.first(selector), leaf)
})

test('compatible selector-list branches share one native candidate collection', t => {
  const { engine, document } = fixture(t, '<i class="a" data-x></i><i class="a"></i><i class="a" hidden></i>')
  const read = document.getElementsByClassName.bind(document)
  let collections = 0
  document.getElementsByClassName = name => { collections++; return read(name) }
  const selector = '.a[data-x], .a[hidden], .a:nth-child(2n)'
  assert.equal(engine.select(selector).length, 3)
  assert.equal(collections, 1)
  collections = 0
  assert.equal(engine.first(selector), document.body.firstElementChild)
  assert.equal(collections, 1)
  const visited = []
  assert.equal(engine.select(selector, document, node => { visited.push(node); return false }).length, 1)
  assert.equal(visited.length, 1)
})

test('effectful selector lists preserve branch order before later pure scans', t => {
  const { engine, document } = fixture(t, '<i class="a"></i><b></b>')
  const node = document.getElementsByTagName('i')[0]
  engine.registerSelector('change', /^:change\b(.*)/, (match, next) => ({ source: 's.change();' + next, status: true }))
  engine.Snapshot.change = () => node.setAttribute('data-later', '')
  assert.deepEqual(Array.from(engine.select('.a[data-before], b:change, .a[data-later]')), [node, node.nextElementSibling])
  assert.equal(engine.selectResolvers.get('.a[data-before], b:change, .a[data-later]').groups, null)
})

test('custom operators and combinators retain their compiler contracts', t => {
  const { engine, document } = fixture(t, '<section><i data-x="yes"></i></section><aside><i></i></aside>')
  const nodes = document.getElementsByTagName('i')
  engine.registerOperator('!=', { p1: '^', p2: '$', p3: 'false' })
  assert.equal(engine.match('[data-x!="no"]', nodes[0]), true)
  assert.equal(engine.match('[data-x!="yes"]', nodes[0]), false)
  engine.registerCombinator('%', () => 'e=e.parentElement;')
  assert.equal(engine.match('section%*', nodes[0]), true)
  assert.equal(engine.match('section%*', nodes[1]), false)
  engine.registerSelector('boundvar', /^:boundvar\b(.*)/, (match, next) => ({ modvar: 'b=17', source: 'if(b===17){' + next + '}', status: true }))
  assert.equal(engine.match('i:is(section > i):boundvar', nodes[0]), true)
})

test('complex pure logical subplans are bound without per-element resolver lookups', t => {
  const { engine, document } = fixture(t, '<main><div class="a"><i></i></div><div class="b"><i></i></div></main>')
  engine.Snapshot.match = engine.Snapshot.matchForgiving = () => { throw new Error('logical cache lookup') }
  assert.equal(engine.select('i:is(main > .a > i, main > .b > i)').length, 2)
  assert.equal(engine.select('i:not(main > .missing > i)').length, 2)
  const first = document.getElementsByTagName('i')[0]
  assert.equal(engine.match(':is(main > .a > i, .missing)', first), true)
})

test('bulk nth-type matching streams interleaved namespaces once', t => {
  const { engine, document } = fixture(t)
  const fragment = document.createDocumentFragment(), nodes = []
  let reads = 0
  for (let i = 0; i < 400; i++) {
    const node = document.createElementNS('urn:' + (i % 4), 'item')
    fragment.append(node); nodes.push(node)
  }
  nodes.forEach((node, i) => Object.defineProperty(node, 'nextElementSibling', { get() { reads++; return nodes[i + 1] || null } }))
  const resolve = engine.compile(':nth-of-type(9)', true)
  assert.equal(resolve(nodes, null, fragment, []).length, 4)
  assert.ok(reads <= nodes.length, String(reads))
})

test('effectful extensions cannot reuse sibling ranks across DOM mutations', t => {
  const { engine, document } = fixture(t, '<main>' + '<i></i>'.repeat(12) + '</main>')
  const parent = document.getElementsByTagName('main')[0]
  engine.registerSelector('mutate', /^:mutate\b(.*)/, (match, next) => ({ source: 's.mutate(e);' + next, status: true }))
  let visits = 0
  engine.Snapshot.mutate = node => { if (++visits === 2) parent.prepend(document.createElement('b')) }
  const resolver = engine.compile(':nth-child(2n):mutate', true)
  // Each extension runs before the next sibling-position lookup.
  const nodes = Array.from(parent.children)
  const actual = Array.from(resolver(nodes, null, document, []))
  assert.deepEqual(actual, nodes.filter((node, i) => i === 0 ? false : (i + 2) % 2 === 0))
  assert.equal(engine.Snapshot.nthUncachedDepth, 0)
})

test('compiled callbacks observe fresh sibling positions after mutation', t => {
  const { engine, document } = fixture(t, '<main>' + '<i></i>'.repeat(12) + '</main>')
  const parent = document.getElementsByTagName('main')[0], nodes = Array.from(parent.children)
  const resolver = engine.compile('i:nth-child(2n)', true, true)
  let calls = 0
  const actual = Array.from(resolver(nodes, () => { if (++calls === 1) parent.prepend(document.createElement('b')) }, document, []))
  assert.deepEqual(actual, [1, 2, 4, 6, 8, 10].map(i => nodes[i]))
  assert.equal(engine.Snapshot.nthUncachedDepth, 0)
})

test('compiled caches enforce byte budgets and bypass oversized entries', t => {
  const { engine } = fixture(t)
  const cache = engine.matchLambdas
  assert.equal(typeof cache.bytes, 'function')
  engine.registerSelector('weight', /^:weight\b(.*)/, (match, next) => ({ source: '/*' + 'x'.repeat(4000) + '*/' + next, status: true }))
  for (let i = 0; i < 400; i++) engine.compile('[x="' + i + '"]:weight', false)
  assert.ok(cache.size() < 1000)
  assert.ok(cache.bytes() <= cache.byteLimit())
  engine.registerSelector('huge', /^:huge\b(.*)/, (match, next) => ({ source: '/*' + 'x'.repeat(1100000) + '*/' + next, status: true }))
  const huge = '[x]:huge'
  const first = engine.compile(huge, false), second = engine.compile(huge, false)
  assert.notEqual(first, second)
  assert.equal(first({ hasAttribute: () => false }, null, null, false), false)
  assert.ok(cache.bytes() <= cache.byteLimit())
})

test('quirks IDs and namespace-local tag seeds preserve CSS matching', t => {
  const { engine, window } = fixture(t)
  const quirks = new window.DOMParser().parseFromString('<main id="Mixed"></main>', 'text/html')
  const main = quirks.getElementsByTagName('main')[0]
  assert.equal(engine.first('#mixed', quirks), main)
  assert.equal(engine.match('#mixed', main), true)
  const xml = new window.DOMParser().parseFromString('<R xmlns:a="urn:a"><a:item/><item/></R>', 'application/xml')
  assert.equal(engine.select('item', xml).length, 2)
  assert.equal(engine.first('item', xml), xml.documentElement.firstElementChild)
  const types = new window.DOMParser().parseFromString('<R xmlns:a="urn:a" xmlns:b="urn:b"><a:item><x/></a:item><b:item><x/></b:item></R>', 'application/xml')
  assert.equal(engine.select('item:only-of-type:has(*)', types).length, 2)
})

test('bulk descendant has inverts sparse witnesses and releases query-local marks', t => {
  const { engine, document } = fixture(t, '<div class="card">'.repeat(50) + '<i class="needle"></i>' + '</div>'.repeat(50))
  const original = engine.Snapshot.has
  let calls = 0
  engine.Snapshot.has = (...args) => { calls++; return original(...args) }
  assert.equal(engine.select('.card:has(.needle)').length, 50)
  assert.equal(calls, 0)
  assert.equal(engine.select('.card:has(.needle):not(:first-child)').length, 0)
  const context = document.getElementsByClassName('card')[5]
  assert.equal(engine.select('.card:has(.needle)', context).length, 44)
  document.getElementsByClassName('needle')[0].remove()
  assert.equal(engine.select('.card:has(.needle)').length, 0)
  const first = document.getElementsByClassName('card')[0]
  first.innerHTML = '<div class="card"><i class="needle"></i><i class="needle"></i><i class="needle"></i></div>'.repeat(50)
  assert.equal(engine.select('.card:has(.needle)').length, 51)
  assert.ok(calls > 0, 'dense witnesses should use per-anchor first-hit matching')
})

test('general-sibling relative chains make one forward pass on misses', t => {
  const { engine, document } = fixture(t, '<main><b></b>' + '<i class="a"></i>'.repeat(120) + '</main>')
  const anchor = document.getElementsByTagName('b')[0], original = engine.Snapshot.hasClass
  let reads = 0
  engine.Snapshot.hasClass = (node, name) => { reads++; return original(node, name) }
  assert.equal(engine.match(':has(~ .a ~ .a ~ .missing)', anchor), false)
  assert.ok(reads <= 120, String(reads))
})
