import assert from 'node:assert/strict'
import { test } from 'vitest'
import { JSDOM } from 'jsdom'
import factory from '../../../src/nwsapi.js'

function setMatcher(element: Element, matcher: (selector: string) => boolean) {
  Reflect.set(element, 'matches', matcher)
}

for (const state of ['buffering', 'stalled']) {
  test(':' + state + ' implies :playing', t => {
    const { window } = new JSDOM('<video id="v"></video>')
    t.onTestFinished(() => window.close())
    const video = window.document.getElementById('v')
    setMatcher(video, () => {
      throw new window.DOMException('Unavailable native state', 'SyntaxError')
    })
    const nw = factory(window)
    Object.defineProperties(video, {
      networkState: { value: 2 },
      currentTime: { value: 1 },
      paused: { value: false },
      readyState: { value: 1 },
    })
    if (state === 'stalled') {
      setMatcher(video, selector => {
        if (selector === ':stalled' || selector === ':playing') {
          return true
        }
        if (selector === ':paused') {
          return false
        }
        throw new window.DOMException('Unsupported selector', 'SyntaxError')
      })
    }
    assert.equal(nw.match(':' + state, video), true)
    assert.equal(nw.match(':playing', video), true)
    assert.equal(nw.match(':paused', video), false)
  })
}

test('non-media elements do not acquire paused or seeking state', t => {
  const { window } = new JSDOM('<div id="d"></div>')
  t.onTestFinished(() => window.close())
  const nw = factory(window)
  for (const selector of [
    ':paused',
    ':seeking',
    ':buffering',
    ':stalled',
    ':volume-locked',
  ]) {
    assert.equal(nw.match(selector, window.document.getElementById('d')), false)
  }
})

test('playback fallback includes startup and buffering, and distinguishes seeking', t => {
  const { window } = new JSDOM(
    '<audio></audio><video><source><track></video><div></div>',
  )
  t.onTestFinished(() => window.close())
  const host = {
    document: window.document,
    DOMException: window.DOMException,
  }
  const nw = factory(host)
  nw.configure({ LEGACY: true })
  for (const media of window.document.querySelectorAll<HTMLMediaElement>(
    'audio,video',
  )) {
    setMatcher(media, () => {
      throw new window.DOMException('Unavailable native state', 'SyntaxError')
    })
    Object.defineProperties(media, {
      paused: { value: false, configurable: true },
      currentTime: { value: 0 },
      readyState: { value: 1, configurable: true },
      networkState: { value: 2 },
      seeking: { value: false, configurable: true },
    })
    assert.equal(nw.match(':playing', media), true)
    assert.equal(nw.match(':paused', media), false)
    assert.equal(nw.match(':buffering', media), true)
    assert.equal(nw.match(':stalled', media), false)
    assert.equal(nw.match(':seeking', media), false)
    Object.defineProperty(media, 'seeking', { value: true })
    assert.equal(nw.match(':seeking', media), true)
    Object.defineProperty(media, 'readyState', { value: 4 })
    assert.equal(nw.match(':buffering', media), false)
    Object.defineProperty(media, 'paused', { value: true })
    assert.equal(nw.match(':playing', media), false)
    assert.equal(nw.match(':paused', media), true)
  }
  for (const element of window.document.querySelectorAll('source,track,div')) {
    for (const state of [
      'playing',
      'paused',
      'seeking',
      'buffering',
      'stalled',
      'muted',
      'volume-locked',
    ]) {
      assert.equal(nw.match(':' + state, element), false)
    }
  }
})

test('muting follows the live audio and video property, not volume or the attribute', t => {
  const { window } = new JSDOM('<audio muted></audio><video muted></video>')
  t.onTestFinished(() => window.close())
  const nw = factory(window)
  for (const media of window.document.querySelectorAll<HTMLMediaElement>(
    'audio,video',
  )) {
    setMatcher(media, () => {
      throw new window.DOMException('Unavailable native state', 'SyntaxError')
    })
    media.muted = true
    assert.equal(nw.match(':muted', media), true)
    media.muted = false
    media.volume = 0
    assert.equal(nw.match(':muted', media), false)
    assert.equal(nw.match(':volume-locked', media), false)
  }
})

test('native state wins, including host-only stalls, volume locks and timelines', t => {
  const { window } = new JSDOM('<video></video><p></p>')
  t.onTestFinished(() => window.close())
  const nw = factory(window)
  const media = window.document.querySelector('video')
  let active = true
  setMatcher(media, () => active)
  for (const state of [
    'playing',
    'paused',
    'seeking',
    'buffering',
    'stalled',
    'muted',
    'volume-locked',
  ]) {
    assert.equal(nw.match(':' + state, media), true)
  }
  active = false
  assert.equal(nw.match(':paused', media), false)
  const paragraph = window.document.querySelector('p')
  for (const selector of [
    ':current',
    ':past',
    ':future',
    ':current(p, .caption)',
  ]) {
    setMatcher(paragraph, candidate => candidate === selector)
    assert.equal(nw.match(selector, paragraph), true)
    setMatcher(paragraph, () => false)
    assert.equal(nw.match(selector, paragraph), false)
  }
})

test('time selectors remain valid without a timeline and validate current arguments', t => {
  const { window } = new JSDOM('<p></p>')
  t.onTestFinished(() => window.close())
  const nw = factory(window)
  for (const selector of [
    ':current',
    ':past',
    ':future',
    ':current(p, .caption)',
  ]) {
    assert.deepEqual(nw.select(selector), [])
  }
  for (const selector of [
    ':current()',
    ':current(',
    ':current(")',
    ':current(/*)',
    ':current(p > span)',
    ':current(p,)',
    ':current(:unknown)',
  ]) {
    assert.throws(() => nw.select(selector), { name: 'SyntaxError' })
    assert.throws(
      () => nw.select(selector, window.document.createDocumentFragment()),
      { name: 'SyntaxError' },
    )
  }
  nw.configure({ FORGIVING: true })
  assert.deepEqual(nw.select(':is(:current(), p)'), [
    window.document.querySelector('p'),
  ])
  assert.deepEqual(nw.select(':is(:current(:unknown), p)'), [
    window.document.querySelector('p'),
  ])
  assert.deepEqual(nw.select(':where(:current(p > span), p)'), [
    window.document.querySelector('p'),
  ])
})
