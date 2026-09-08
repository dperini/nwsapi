import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { runInNewContext } from 'node:vm'
import { JSDOM } from 'jsdom'
import { test } from 'vitest'

const require = createRequire(import.meta.url)
const factory = require('../../../src/nwsapi.js')
function fixture(t, module, html, legacy = false) {
  const { window } = new JSDOM(html)
  t.onTestFinished(() => window.close())
  const engine = factory(window)
  engine.configure({ LEGACY: legacy })
  const file = require.resolve(`../../../src/modules/nwsapi-${module}.js`)
  runInNewContext(
    readFileSync(file, 'utf8'),
    {
      NW: { Dom: engine },
      document: legacy ? { documentElement: {} } : window.document,
    },
    { filename: file },
  )
  return { engine, doc: window.document }
}

for (const legacy of [false, true]) {
  test(`traversal selects ancestors and siblings, skipping text and comments (legacy=${legacy})`, t => {
    const { engine: e, doc } = fixture(
      t,
      'traversal',
      '<main><section><i id="a"></i> text <!-- gap --><b id="b"></b><i id="c"></i></section></main>',
      legacy,
    )
    const a = doc.getElementById('a'),
      b = doc.getElementById('b'),
      c = doc.getElementById('c')
    assert.equal(e.next(a), b)
    assert.equal(e.next(a, 0), b)
    assert.equal(e.next(a, 1), c)
    assert.equal(e.next(a, 'i'), c)
    assert.equal(e.previous(c), b)
    assert.equal(e.previous(c, 1), a)
    assert.equal(e.previous(c, 'i'), a)
    assert.equal(e.up(a), a.parentNode)
    assert.equal(e.up(a, 1), a.parentNode.parentNode)
    assert.equal(e.up(a, 'main'), a.parentNode.parentNode)
    for (const expr of [99, -1, '.absent']) {
      assert.equal(e.next(a, expr), null)
      assert.equal(e.previous(c, expr), null)
      assert.equal(e.up(a, expr), null)
    }
    assert.equal(e.next(c), null)
    assert.equal(e.previous(a), null)
    assert.equal(e.up(doc.documentElement, 'article'), null)
  })
  test(`down handles defaults, indexes, selectors, and empty trees (legacy=${legacy})`, t => {
    const { engine: e, doc } = fixture(
      t,
      'traversal',
      '<main> text <!-- gap --><section><b></b></section><i></i></main>',
      legacy,
    )
    const main = doc.getElementsByTagName('main')[0],
      section = main.firstElementChild,
      b = section.firstElementChild
    assert.equal(e.down(main), section)
    assert.equal(e.down(main, null), section)
    assert.equal(e.down(main, 0), main)
    assert.equal(e.down(main, 1), section)
    assert.equal(e.down(main, 2), b)
    assert.equal(e.down(main, 'main'), main)
    assert.equal(e.down(main, 'b'), b)
    for (const expr of [99, -1, '.absent']) {
      assert.equal(e.down(main, expr), null)
    }
    assert.equal(e.down(b), null)
    b.textContent = 'only text'
    assert.equal(e.down(b, null), null)
  })
  test(`jQuery element extensions compose and observe mutations (legacy=${legacy})`, t => {
    const { engine: e, doc } = fixture(
      t,
      'jquery',
      '<main><input id="checkbox" type="checkbox"><input id="file" type="file"><input id="image" type="image"><input id="password" type="password"><input id="radio" type="radio"><input id="reset" type="reset"><input id="submit" type="submit"><input id="text"><input id="input-button" type="button"><button id="button"></button><textarea id="textarea"></textarea><select id="select"></select><h1 id="h1"></h1><h6 id="h6"></h6><div id="parent">text</div><div id="empty"></div></main>',
      legacy,
    )
    const main = doc.getElementsByTagName('main')[0]
    const cases = [
      ...[
        'checkbox',
        'file',
        'image',
        'password',
        'radio',
        'reset',
        'text',
      ].map(name => [name, [name]]),
      ['submit', ['submit', 'button']],
      ['button', ['input-button', 'button']],
      ['header', ['h1', 'h6']],
      ['parent', ['parent']],
      [
        'input',
        [
          'checkbox',
          'file',
          'image',
          'password',
          'radio',
          'reset',
          'submit',
          'text',
          'input-button',
          'button',
          'textarea',
          'select',
        ],
      ],
    ]
    for (const [pseudo, expected] of cases) {
      for (const selector of [
        `:${String(pseudo)}`,
        `:${String(pseudo).toUpperCase()}:not(.absent)`,
      ]) {
        assert.deepEqual(
          e.select(selector, main).map(node => node.id),
          expected,
          selector,
        )
        for (const node of Array.from(main.children)) {
          assert.equal(
            e.match(selector, node),
            expected.includes(node.id),
            selector + ' ' + node.id,
          )
        }
      }
    }
    const input = doc.getElementById('checkbox')
    input.setAttribute('type', 'radio')
    assert.equal(e.match(':checkbox', input), false)
    assert.equal(e.match(':radio', input), true)
    assert.deepEqual(e.select(':checkbox', main), [])
    assert.deepEqual(e.select('main:has(> :radio)', doc), [main])
  })
}

test('jQuery visibility uses either layout dimension and supports callbacks', t => {
  const { engine: e, doc } = fixture(
    t,
    'jquery',
    '<main><i id="hidden"></i><i id="wide"></i><i id="tall"></i></main>',
  )
  const wide = doc.getElementById('wide'),
    tall = doc.getElementById('tall')
  Object.defineProperty(wide, 'offsetWidth', { value: 10 })
  Object.defineProperty(tall, 'offsetHeight', { value: 10 })
  assert.deepEqual(
    e.select('i:hidden', doc).map(n => n.id),
    ['hidden'],
  )
  assert.deepEqual(
    e.select('i:visible', doc).map(n => n.id),
    ['wide', 'tall'],
  )
  assert.equal(e.match(':visible', wide), true)
  assert.equal(e.match(':hidden', wide), false)
  const seen = []
  assert.deepEqual(
    e.select('i:visible', doc, n => {
      seen.push(n)
      return false
    }),
    [wide],
  )
  assert.deepEqual(seen, [wide])
})

test('jQuery positional filters retain scoped candidate order on repeated queries', t => {
  const { engine: e, doc } = fixture(
    t,
    'jquery',
    '<main><p id="a"></p><p id="b"></p><p id="c"></p><p id="d"></p></main>',
  )
  const main = doc.getElementsByTagName('main')[0]
  assert.deepEqual(
    e.select(':scope > p:even', main).map(n => n.id),
    ['a', 'c'],
  )
  for (const [pseudo, expected] of [
    ['even', ['a', 'c']],
    ['odd', ['b', 'd']],
    ['eq(1)', ['b']],
    ['lt(2)', ['a', 'b']],
    ['gt(1)', ['c', 'd']],
    ['first', ['a']],
    ['last', ['d']],
    ['nth(2)', ['c']],
  ]) {
    for (let run = 0; run < 2; run++) {
      assert.deepEqual(
        e.select('p:' + pseudo, main).map(n => n.id),
        expected,
        String(pseudo),
      )
    }
  }
})

test('positional match and compiled NodeList resolvers use independent counters', t => {
  const { engine: e, doc } = fixture(
    t,
    'jquery',
    '<p id="a"></p><p id="b"></p><p id="c"></p>',
  )
  const nodes = doc.querySelectorAll('p'),
    a = nodes[0]
  for (const [pseudo, expected] of [
    ['even', true],
    ['odd', false],
    ['eq(0)', true],
    ['eq(1)', false],
    ['lt(1)', true],
    ['gt(0)', false],
    ['first', true],
    ['last', false],
    ['nth(0)', true],
  ]) {
    for (let run = 0; run < 2; run++) {
      assert.equal(e.match('p:' + pseudo, a), expected, String(pseudo))
    }
  }
  assert.deepEqual(e.compile('p:odd', null)(nodes, null, doc, []), [nodes[1]])
  const seen = []
  assert.deepEqual(
    e.compile('p:odd', true, true)(
      Array.from(nodes),
      n => {
        seen.push(n)
        return false
      },
      doc,
      [],
    ),
    [nodes[1]],
  )
  assert.deepEqual(seen, [nodes[1]])
  assert.deepEqual(
    e.select('p:even:nth-child(n)', doc).map(n => n.id),
    ['a', 'c'],
  )
})

test('positional parameters reject executable text, unsafe integers, and malformed arguments', t => {
  const { engine: e, doc } = fixture(t, 'jquery', '<p></p>')
  for (const name of ['eq', 'lt', 'gt', 'nth']) {
    for (const value of [
      '',
      '1.5',
      '1+1',
      '1;throw 1',
      'Infinity',
      '9007199254740992',
    ]) {
      assert.throws(() => e.select(`p:${name}(${value})`, doc), {
        name: 'SyntaxError',
      })
    }
  }
  assert.equal(e.select('p:eq( +0 )', doc).length, 1)
  assert.equal(e.select('p:eq(-1)', doc).length, 0)
  assert.equal(e.select('p:nth(99)', doc).length, 0)
  for (const selector of [
    ':visible(foo)',
    ':checkbox(foo)',
    ':has()',
    ':unknown',
  ]) {
    assert.throws(() => e.select(selector, doc), { name: 'SyntaxError' })
  }
  e.configure({ VERBOSITY: false, LOGERRORS: false })
  assert.deepEqual(e.select('p:eq(nope)', doc), [])
})
