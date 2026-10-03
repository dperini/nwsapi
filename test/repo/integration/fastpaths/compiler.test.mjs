import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { test } from 'node:test'

const require = createRequire(import.meta.url)
const { JSDOM } = require('jsdom')
const source = readFileSync(
  process.env['NWSAPI_TEST_SOURCE'] ||
    new URL('../../../../src/nwsapi.js', import.meta.url),
  'utf8',
)

function fixture(t, html = '<div id="target" class="card"><span></span></div>') {
  const { window } = new JSDOM('<!doctype html>' + html, {
    runScripts: 'outside-only',
  })
  t.after(() => window.close())
  window.eval(source)
  return { window, document: window.document, engine: window.NW.Dom }
}

test('compound guards reject candidates before relational and nth work', t => {
  const { document, engine } = fixture(t)
  const target = document.getElementById('target')
  let expensive = 0
  engine.Snapshot.has = () => { expensive++; return true }
  engine.Snapshot.nthElement = element => { if (element) expensive++; return 2 }
  for (const selector of [
    'section:has(*)', '#missing:has(*)', '.missing:has(*)',
    '[missing]:has(*)', '[id="missing"]:has(*)', '.missing:nth-child(2)',
    ':has(*).missing',
  ]) {
    assert.equal(engine.match(selector, target), false, selector)
    assert.equal(expensive, 0, selector)
  }
  assert.equal(engine.match('div#target.card[id]:has(> span)', target), true)
  assert.equal(expensive, 1)
})

test('compound guards stay on their own side of every combinator', t => {
  const { document, engine } = fixture(t,
    '<main class="outer"><div class="card" id="target"><span></span></div><p class="later"></p></main>',
  )
  const target = document.getElementById('target')
  for (const selector of [
    'main.outer > div.card:has(> span)',
    'main.outer div.card:has(> span)',
    'div.card:has(> span) + p.later',
    'div.card:has(> span) ~ p.later',
  ]) {
    const node = selector.endsWith('p.later') ? target.nextElementSibling : target
    assert.equal(engine.match(selector, node), true, selector)
    assert.deepEqual(Array.from(engine.select(selector)), [node], selector)
  }
})

test('extensions and pseudo-element remapping are guard barriers', t => {
  const { document, engine } = fixture(t)
  const target = document.getElementById('target')
  engine.Snapshot.visits = 0
  engine.registerSelector('observe', /^:observe\b(.*)/, (match, next) => ({
    source: 's.visits++;' + next, status: true,
  }))
  assert.equal(engine.match('.missing:observe', target), false)
  assert.equal(engine.Snapshot.visits, 1)
  assert.equal(engine.match('div.card::before', { element: target, type: '::before' }), true)
})

test('matching stops at the first successful ancestor walk', t => {
  const { document, engine } = fixture(t,
    '<div class="outer"><div class="outer"><div class="outer"><span class="leaf" id="target"></span></div></div></div>',
  )
  const hasClass = engine.Snapshot.hasClass
  let ancestors = 0
  engine.Snapshot.hasClass = (element, name) => {
    if (name === 'outer') ancestors++
    return hasClass(element, name)
  }
  assert.equal(engine.match('.outer .leaf', document.getElementById('target')), true)
  assert.equal(ancestors, 1)
})

test('compiler caches distinguish callback and item collection modes', t => {
  const { document, engine } = fixture(t)
  const target = document.getElementById('target')
  const nodes = [target]
  let calls = 0
  for (const callbackFirst of [false, true]) {
    engine.configure({}, true)
    for (const enabled of [callbackFirst, !callbackFirst]) {
      const match = engine.compile('div', false, enabled)
      const select = engine.compile('div', true, enabled)
      assert.equal(match(target, () => { calls++ }, null, false), true)
      assert.deepEqual(Array.from(select(nodes, () => { calls++ }, document, [])), nodes)
    }
    const items = { item: index => nodes[index] || null }
    const select = engine.compile('div', null)
    assert.deepEqual(Array.from(select(items, null, document, [])), nodes)
  }
  assert.equal(calls, 4)
})

test('match resolver reuse preserves callbacks when calls alternate', t => {
  const { document, engine } = fixture(t)
  const target = document.getElementById('target')
  let calls = 0
  for (let i = 0; i < 3; i++) {
    assert.equal(engine.match('div', target), true)
    assert.equal(engine.match('div', target, () => { calls++ }), true)
    assert.equal(engine.match('div', target), true)
  }
  assert.equal(calls, 3)
})

test(':has() skips impossible branches before fetching candidates', t => {
  const { document, engine } = fixture(t, '<div id="target"></div>')
  const target = document.getElementById('target')
  let collections = 0
  target.getElementsByTagName = () => { collections++; return [] }
  target.getElementsByClassName = () => { collections++; return [] }
  const parent = target.parentElement
  parent.getElementsByTagName = () => { collections++; return [] }
  for (const selector of [':has(span)', ':has(> .missing)', ':has(+ span)', ':has(~ span)']) {
    assert.equal(engine.match(selector, target), false, selector)
  }
  assert.equal(collections, 0)
  assert.throws(() => engine.match(':has(span, :unknown)', target), { name: 'SyntaxError' })
})

test(':has() stops visiting candidates and branches and reuses compiled plans', t => {
  const { document, engine } = fixture(t,
    '<div id="target"><span></span><span></span><span></span><em></em></div>',
  )
  const target = document.getElementById('target')
  let compilations = 0
  engine.Snapshot.visits = 0
  engine.registerSelector('visit', /^:visit\b(.*)/, (match, next) => {
    compilations++
    return { source: 's.visits++;' + next, status: true }
  })
  const selector = ':has(> span:visit, > em:visit)'
  assert.equal(engine.match(selector, target), true)
  assert.equal(engine.Snapshot.visits, 1)
  const compiled = compilations
  engine.Snapshot.visits = 0
  assert.equal(engine.match(selector, target), true)
  assert.equal(engine.Snapshot.visits, 1)
  assert.equal(compilations, compiled)
  target.replaceChildren()
  assert.equal(engine.match(selector, target), false)
})

test('nth matching releases cached positions before DOM mutations', t => {
  const { document, engine } = fixture(t, '<main><i></i><i id="target"></i></main>')
  const target = document.getElementById('target')
  assert.equal(engine.match(':nth-child(2)', target), true)
  target.before(document.createElement('i'))
  assert.equal(engine.match(':nth-child(2)', target), false)
  assert.equal(engine.match(':nth-child(3)', target), true)
})

test('nested nth queries keep positions until the outer query finishes', t => {
  const { engine } = fixture(t,
    '<main><i></i><i></i><i></i><i></i><i></i><i></i></main>',
  )
  const nthElement = engine.Snapshot.nthElement
  let cleanups = 0
  engine.Snapshot.nthElement = (element, direction) => {
    if (!element) cleanups++
    return nthElement(element, direction)
  }
  assert.equal(engine.select('i:nth-child(2n):not(:nth-child(3n))').length, 2)
  assert.equal(cleanups, 1)
  assert.equal(engine.Snapshot.nthElementDepth, 0)
})

test('nth state is released when extension code throws', t => {
  const { document, engine } = fixture(t, '<main><i></i><i id="target"></i></main>')
  const target = document.getElementById('target')
  engine.registerSelector('throws', /^:throws\b(.*)/, () => ({
    source: 'throw new Error("extension failed");', status: true,
  }))
  assert.throws(() => engine.match(':throws:nth-child(2)', target), /extension failed/)
  assert.equal(engine.Snapshot.nthElementDepth, 0)
  target.before(document.createElement('i'))
  assert.equal(engine.match(':nth-child(2)', target), false)
})

test('constant nth formulas and wildcard namespaces emit no runtime checks', t => {
  const { engine } = fixture(t)
  const compiled = engine.compile('*|*:nth-child(n)', false).toString()
  assert.equal(compiled.includes('if(true)'), false)
  assert.equal(compiled.includes('s.nthElement('), false)
})

test('first() stops before reading the rest of a native candidate collection', t => {
  const { document, engine } = fixture(t)
  const target = document.getElementById('target')
  document.getElementsByTagName = () => ({
    length: 2,
    0: target,
    get 1() { throw new Error('visited a later candidate') },
  })
  let callbacks = 0
  for (let pass = 0; pass < 2; pass++) {
    assert.equal(engine.first('div', document, node => {
      callbacks++
      assert.equal(node, target)
    }), target)
  }
  assert.equal(callbacks, 2)
})

test(':has() consumes native candidates without first copying the collection', t => {
  const { document, engine } = fixture(t)
  const target = document.getElementById('target')
  const child = target.firstElementChild
  child.className = 'needle'
  target.getElementsByClassName = () => ({
    length: 2,
    0: child,
    get 1() { throw new Error('visited a later candidate') },
  })
  assert.equal(engine.match(':has(> .needle)', target), true)
})

test('first() retains document order for lists and fresh results after mutations', t => {
  const { document, engine } = fixture(t,
    '<main><p id="early"></p><div id="late"></div></main>',
  )
  const early = document.getElementById('early')
  const late = document.getElementById('late')
  for (let pass = 0; pass < 2; pass++) {
    assert.equal(engine.first('div, p'), early)
    assert.equal(engine.first('p'), early)
  }
  early.remove()
  assert.equal(engine.first('p'), null)
  assert.equal(engine.first('div, p'), late)
  assert.throws(() => engine.first('p:has(:unknown)', document.createElement('aside')), {
    name: 'SyntaxError',
  })
})

test('form validation events retain a snapshot of the candidate collection', t => {
  const { document, engine } = fixture(t,
    '<main><input required id="one"><input required id="two"></main>',
  )
  const one = document.getElementById('one')
  const two = document.getElementById('two')
  const visited = []
  one.addEventListener('invalid', () => { visited.push('one'); one.remove() })
  two.addEventListener('invalid', () => visited.push('two'))
  assert.equal(engine.first('input:valid'), null)
  assert.deepEqual(visited, ['one', 'two'])
})

test('forgiving lists compile reached branches once and defer later branches', t => {
  const { document, engine } = fixture(t)
  const target = document.getElementById('target')
  let invalidCompilations = 0
  let deferredCompilations = 0
  engine.registerSelector('bad', /^:bad\b(.*)/, () => {
    invalidCompilations++
    throw new Error('invalid branch')
  })
  engine.registerSelector('deferred', /^:deferred\b(.*)/, (match, next) => {
    deferredCompilations++
    return { source: next, status: true }
  })
  for (let pass = 0; pass < 3; pass++) {
    assert.equal(engine.match(':is(:bad, div)', target), true)
    assert.equal(engine.match(':where(div, :deferred)', target), true)
  }
  assert.equal(invalidCompilations, 1)
  assert.equal(deferredCompilations, 0)
  assert.equal(engine.match(':where(div, :deferred)', target.firstElementChild), true)
  assert.equal(deferredCompilations, 1)
  assert.equal(engine.compile(':is(div, span)', false).toString().includes('s.matchForgiving(['), false)
})

test('new extensions invalidate cached forgiving failures', t => {
  const { document, engine } = fixture(t)
  const target = document.getElementById('target')
  for (let pass = 0; pass < 2; pass++) assert.equal(engine.match(':is(:later)', target), false)
  engine.registerSelector('later', /^:later\b(.*)/, (match, next) => ({ source: next, status: true }))
  assert.equal(engine.match(':is(:later)', target), true)
  engine.configure({ FORGIVING: false })
  assert.throws(() => engine.match(':is(:unknown, div)', target), { name: 'SyntaxError' })
})

test('forgiving plans retry runtime failures without recompiling valid branches', t => {
  const { document, engine } = fixture(t)
  const target = document.getElementById('target')
  let compilations = 0
  engine.registerSelector('ready', /^:ready\b(.*)/, (match, next) => {
    compilations++
    return { source: 'if(!s.ready)throw new Error("not ready");' + next, status: true }
  })
  assert.equal(engine.match(':is(:ready, .missing)', target), false)
  engine.Snapshot.ready = true
  assert.equal(engine.match(':is(:ready, .missing)', target), true)
  assert.equal(compilations, 1)
})

test('early-exit plans preserve positional extensions that rewrite selection macros', t => {
  const { document, engine } = fixture(t,
    '<main id="target"><i id="one"></i><i id="two"></i><i id="three"></i></main>',
  )
  engine.registerSelector('at', /^:at\((\d+)\)(.*)/, (match, next, mode, callback) => {
    assert.equal(typeof mode, 'boolean')
    assert.ok(!callback)
    return {
      source: next.replace(engine.S_BODY, 'if(x++==' + match[1] + '){' + engine.S_BODY + '}'),
      status: true, modvar: 'x=0',
    }
  })
  for (let pass = 0; pass < 2; pass++) {
    assert.equal(engine.first('i:at(1)'), document.getElementById('two'))
    assert.equal(engine.match(':has(> i:at(1))', document.getElementById('target')), true)
    assert.equal(engine.first('i:at(9)'), null)
  }
})

test('simple adjacent has plans inspect one sibling without a collection lookup', t => {
  const { document, engine } = fixture(t,
    '<main><i id="anchor"></i><b class="hit" id="sibling"><em></em></b></main>',
  )
  const anchor = document.getElementById('anchor')
  const parent = anchor.parentElement
  parent.getElementsByTagName = () => { throw new Error('searched the parent subtree') }
  parent.getElementsByClassName = () => { throw new Error('searched the parent subtree') }
  for (let pass = 0; pass < 2; pass++) {
    assert.equal(engine.match(':has(+ b.hit#sibling)', anchor), true)
    assert.equal(engine.match(':has(+ b.missing)', anchor), false)
  }
  const fragment = document.createDocumentFragment()
  fragment.append(anchor, document.getElementById('sibling'))
  assert.equal(engine.match(':has(+ b.hit)', anchor), true)
})

test('adjacent has declines uppercase tags and preserves XML case', t => {
  const { document, engine, window } = fixture(t,
    '<main><i id="anchor"></i><b></b></main>',
  )
  assert.equal(engine.match(':has(+ B)', document.getElementById('anchor')), true)
  const xml = new window.DOMParser().parseFromString('<root><i/><B/><b/></root>', 'application/xml')
  const anchor = xml.documentElement.firstElementChild
  assert.equal(engine.match(':has(+ B)', anchor), true)
  assert.equal(engine.match(':has(+ b)', anchor), false)
})

test('wildcard logical and relational selectors emit direct or constant guards', t => {
  const { document, engine } = fixture(t)
  const target = document.getElementById('target')
  engine.Snapshot.has = () => { throw new Error('used a query plan for a wildcard') }
  engine.Snapshot.matchForgiving = () => { throw new Error('used a logical plan for a wildcard') }
  for (const selector of [':has(*)', ':has(> *)', ':is(*)', ':where(*)']) {
    assert.equal(engine.match(selector, target), true, selector)
  }
  assert.equal(engine.match(':has(+ *)', target), false)
  const sibling = document.createElement('aside')
  target.after(sibling)
  assert.equal(engine.match(':has(+ *)', target), true)
  assert.equal(engine.match(':has(~ *)', target), true)
  assert.equal(engine.match(':has(*)', target.firstElementChild), false)
})

test('logical selector arguments preserve CSS escapes in generated strings', t => {
  const { document, engine } = fixture(t)
  const target = document.getElementById('target')
  target.id = 'a+b'
  for (const selector of [String.raw`:not(#a\+b)`, String.raw`:matches(#a\+b)`]) {
    assert.equal(engine.match(selector, target), selector.startsWith(':matches'), selector)
  }
  engine.configure({ FORGIVING: false })
  assert.equal(engine.match(String.raw`:is(#a\+b)`, target), true)
})

test('query plans invalidate guards when document compatibility modes change', t => {
  const { window, document, engine } = fixture(t, '<i class="card"></i>')
  const quirks = new window.DOMParser().parseFromString('<i class="card"></i>', 'text/html')
  assert.equal(quirks.compatMode, 'BackCompat')
  for (const context of [document, quirks, document, quirks]) {
    const expected = context === quirks ? 1 : 0
    assert.equal(engine.select('i:is(.CARD)', context).length, expected)
    assert.equal(engine.first('i:is(.CARD)', context) !== null, !!expected)
  }
})

test('query plans invalidate HTML attribute folding when switching to XML', t => {
  const { window, document, engine } = fixture(t, '<input type="checkbox">')
  const xml = new window.DOMParser().parseFromString('<root><input type="checkbox"/></root>', 'application/xml')
  for (const context of [document, xml, document, xml]) {
    const expected = context === document ? 1 : 0
    assert.equal(engine.select('input:is([type="CHECKBOX"])', context).length, expected)
    assert.equal(engine.first('input:is([type="CHECKBOX"])', context) !== null, !!expected)
  }
})

test('new extensions invalidate quiet failures cached by every selector API', t => {
  const { document, engine } = fixture(t)
  const target = document.getElementById('target')
  engine.configure({ VERBOSITY: false, LOGERRORS: false })
  assert.equal(engine.match(':newly-supported', target), false)
  assert.equal(engine.select('div:newly-supported').length, 0)
  assert.equal(engine.first('div:newly-supported'), null)
  engine.registerSelector('supported', /^:newly-supported\b(.*)/, (match, next) => ({
    source: next, status: true,
  }))
  assert.equal(engine.match(':newly-supported', target), true)
  assert.equal(engine.select('div:newly-supported').length, 1)
  assert.equal(engine.first('div:newly-supported'), target)
})
