import assert from 'node:assert/strict'
import { test, vi } from 'vitest'
import { JSDOM } from 'jsdom'
import { tagBit } from '../../../src/core/ancestor/mask.mts'
import type { EngineState } from '../../../src/core/state/types.mts'
import factory from '../../../dist/nwsapi.js'

test('ancestor tag memo stays bounded and recomputes deterministic masks', () => {
  const engine = {
    HTML_DOCUMENT: false,
    tagBits: Object.create(null) as Record<string, number>,
    tagBitCount: 0,
    primordials: { ObjectCreate: Object.create },
  }
  const typedEngine = engine as unknown as EngineState
  const name = 'section'
  const expected = tagBit(typedEngine, name)
  for (let i = 0; i < 1024; i++) {
    tagBit(typedEngine, 'x-audit-' + i)
    assert.ok(Object.keys(engine.tagBits).length <= 256)
  }
  assert.equal(tagBit(typedEngine, name), expected)
  assert.ok(Object.keys(engine.tagBits).length <= 256)
})

test('language range memo turns over without changing HTML or XML matching', t => {
  const { window: htmlWindow } = new JSDOM(
    '<main lang="en-US"><span id="html"></span></main>',
  )
  const { window: xmlWindow } = new JSDOM(
    '<Root xml:lang="en-US"><Span id="xml"/></Root>',
    { contentType: 'application/xml' },
  )
  t.onTestFinished(() => {
    htmlWindow.close()
    xmlWindow.close()
  })
  const html = factory(htmlWindow)
  const xml = factory(xmlWindow)
  const htmlTarget = htmlWindow.document.getElementById('html')!
  const xmlTarget = xmlWindow.document.getElementById('xml')!
  const split = vi.spyOn(String.prototype, 'split')
  t.onTestFinished(() => split.mockRestore())
  assert.equal(html.match(':lang(en)', htmlTarget), true)
  assert.equal(xml.match(':lang(en)', xmlTarget), true)
  const probe = 'x-audit-probe-unique'
  const probeSelector = ':lang(' + probe + ')'
  const rangeSplits = () =>
    split.mock.contexts.filter(context => context === probe).length
  html.match(probeSelector, htmlTarget)
  const afterCold = rangeSplits()
  assert.ok(afterCold > 0)
  html.match(probeSelector, htmlTarget)
  assert.equal(rangeSplits(), afterCold)
  for (let i = 0; i < 1000; i++) {
    html.match(':lang(x-audit-' + i + ')', htmlTarget)
  }
  const beforeRecompute = rangeSplits()
  html.match(probeSelector, htmlTarget)
  assert.equal(rangeSplits(), beforeRecompute + 1)
  assert.equal(html.match(probeSelector, htmlTarget), false)
  assert.equal(html.match(':lang(en-US)', htmlTarget), true)
  assert.equal(xml.match(':lang(en-US)', xmlTarget), true)
  assert.equal(xml.match(':lang(en)', xmlTarget), true)
  assert.equal(xml.match(':lang(EN)', xmlTarget), true)
})

test('language memo turnover uses the startup object constructor', t => {
  const { window } = new JSDOM('<!doctype html><p lang="en"></p>')
  t.onTestFinished(() => window.close())
  const engine = factory(window)
  const element = window.document.getElementsByTagName('p')[0]!
  const isLanguage = Reflect.get(engine.Snapshot, 'isLanguage') as (
    element: Element,
    range: string,
  ) => boolean
  const create = Object.create
  let calls = 0
  Object.create = function (prototype) {
    ++calls
    return create(prototype)
  }
  try {
    for (let i = 0; i < 300; ++i) {
      assert.equal(isLanguage(element, 'x-constructor-' + i), false)
    }
    assert.equal(calls, 0)
  } finally {
    Object.create = create
  }
})
