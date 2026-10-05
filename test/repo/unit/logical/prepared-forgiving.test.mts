import { registerLegacy } from '../../common/legacy.mts'
import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'
import { test, vi } from 'vitest'
import factory from '../../../../dist/nwsapi.js'

test('forgiving branches compile once and invalid branches stay nonmatching', t => {
  const { window } = new JSDOM('<div class="hit"></div><div></div>')
  t.onTestFinished(() => window.close())
  const engine = registerLegacy(factory(window))
  const log = vi.spyOn(console, 'log').mockImplementation(() => {})
  engine.configure({ VERBOSITY: false, LOGERRORS: false })
  let compilations = 0
  engine.registerSelector('audit-unknown', /^:audit-unknown(.*)/, () => {
    ++compilations
    throw new SyntaxError('Invalid forgiving branch')
  })

  for (let i = 0; i < 3; ++i) {
    assert.equal(
      engine.select('div:is(.hit,:audit-unknown)', window.document).length,
      1,
    )
  }
  assert.equal(log.mock.calls.length, 0)
  assert.equal(compilations, 1)
})

test('forgiving preparation preserves quiet logging and strict validation', t => {
  const { window } = new JSDOM('<div></div>')
  t.onTestFinished(() => window.close())
  const engine = registerLegacy(factory(window))
  const log = vi.spyOn(console, 'log').mockImplementation(() => {})
  engine.configure({ VERBOSITY: false, LOGERRORS: true })

  for (let i = 0; i < 2; ++i) {
    assert.deepEqual(
      engine.select('div:is(:audit-unknown)', window.document),
      [],
    )
  }
  assert.equal(log.mock.calls.length, 1)
  engine.configure({ FORGIVING: false, VERBOSITY: true })
  assert.throws(
    () => engine.select('div:is(:audit-unknown)', window.document),
    { name: 'SyntaxError' },
  )
})

test('nested logical nth predicates preserve outer compiler state', t => {
  const { window } = new JSDOM(
    '<main><i class="a"></i><i class="b"></i><i class="a"></i><i class="b"></i></main>',
  )
  t.onTestFinished(() => window.close())
  const engine = registerLegacy(factory(window))
  const nodes = Array.from(window.document.querySelectorAll('i'))

  assert.deepEqual(engine.select('i:nth-child(2n):is(:nth-child(2n), .a)'), [
    nodes[1],
    nodes[3],
  ])
  assert.deepEqual(
    engine.select('i:nth-child(2n):not(:is(:nth-child(4), .a))'),
    [nodes[1]],
  )
})

test('saved resolvers rebuild forgiving dependencies after cache clearing', t => {
  const { window } = new JSDOM('<div class="hit"></div><div></div>')
  t.onTestFinished(() => window.close())
  const engine = registerLegacy(factory(window))
  const candidates = Array.from(window.document.getElementsByTagName('div'))
  const resolver = engine.compile('div:is(.hit,:audit-unknown)', true)!
  const run = () => resolver(candidates, null, window.document, [])

  assert.deepEqual(run(), [candidates[0]])
  engine.configure({}, true)
  assert.deepEqual(run(), [candidates[0]])
  candidates[1]!.className = 'hit'
  assert.deepEqual(run(), candidates)
})

test('document changes reprepare namespace-sensitive logical branches', t => {
  const first = new JSDOM('<root xmlns="urn:first"><item/></root>', {
    contentType: 'application/xml',
  })
  const second = new JSDOM('<root xmlns="urn:second"><item/></root>', {
    contentType: 'application/xml',
  })
  t.onTestFinished(() => {
    first.window.close()
    second.window.close()
  })
  const engine = registerLegacy(factory(first.window))
  const selector = 'item:is(*|item, .missing)'

  assert.equal(engine.select(selector, first.window.document).length, 1)
  assert.equal(engine.select(selector, second.window.document).length, 1)
})

test('a registered selector makes a formerly invalid forgiving branch valid', t => {
  const { window } = new JSDOM('<div></div><div class="hit"></div>')
  t.onTestFinished(() => window.close())
  const engine = registerLegacy(factory(window))

  assert.deepEqual(
    Array.from(engine.select('div:is(:audit-ready)', window.document)),
    [],
  )
  engine.registerSelector(
    'audit-ready',
    /^:audit-ready(.*)/,
    (_match, source) => ({
      source: `if(e.className==="hit"){${source}}`,
      status: true,
      match: _match,
    }),
  )
  assert.deepEqual(
    Array.from(engine.select('div:is(:audit-ready)', window.document)).map(
      element => element.className,
    ),
    ['hit'],
  )
})
