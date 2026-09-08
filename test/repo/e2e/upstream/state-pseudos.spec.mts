/*
 * Committed coverage for the Selectors 4 state pseudo-classes wired into
 * src/nwsapi.js (:open, :closed, :modal, :fullscreen, :picture-in-picture
 * and the time-dimensional :current/:past/:future).
 *
 * Uses the same init-script mechanism as wpt.spec.mts: src/nwsapi.js is
 * evaluated and NW.Dom.install() called before any page script runs, then
 * assertions run in-page against NW.Dom on the fixture page
 * test/repo/e2e/upstream/fixtures/state-pseudos.html via a local file URL.
 *
 * The last test opens the fixture WITHOUT the init script to capture native
 * Chromium ground truth: NW.Dom.install() patches Document.prototype, so in
 * an instrumented page even a DOMParser-created XMLDocument goes through the
 * NW override — the only way to see the native engine is a clean page.
 */
/* global window, document, DOMParser */
// ^ the page.evaluate() callbacks below run inside Chromium, not in Node.
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { expect, test } from '@playwright/test'
import { REPO_ROOT as repoRoot } from '../../../../scripts/repo/lib/paths.mts'

const nwsapiSource = readFileSync(
  path.join(repoRoot, 'src', 'nwsapi.js'),
  'utf8',
)

const FIXTURE = new URL('./fixtures/state-pseudos.html', import.meta.url).href
const XML_SOURCE = '<root><details open="open"/><dialog open=""/></root>'

const initScript = `${nwsapiSource}
;(function () {
  try {
    window.__nwNativeQuerySelectorAll = Document.prototype.querySelectorAll;
    window.NW.Dom.install();
  } catch (e) {
    window.__nwInstallError = String((e && e.stack) || e);
  }
})();
`

async function openFixtureWithNW(page) {
  await page.addInitScript({ content: initScript })
  const response = await page.goto(FIXTURE)
  expect(response, `no HTTP response for ${FIXTURE}`).not.toBeNull()
  expect(
    response.ok(),
    `HTTP ${response.status()} for ${FIXTURE} — is scripts/serve.mts the server on port 8000?`,
  ).toBe(true)
  expect(
    await page.evaluate('window.__nwInstallError || null'),
    'NW.Dom.install() must not throw',
  ).toBeNull()
  expect(
    await page.evaluate(() => ({
      installed:
        document.querySelectorAll !== window['__nwNativeQuerySelectorAll'],
      nodeList: document.querySelectorAll('html') instanceof NodeList,
      root:
        document.querySelectorAll('html').item(0) === document.documentElement,
    })),
    'installed queries must use the override and return NodeList-compatible results',
  ).toEqual({ installed: true, nodeList: true, root: true })
}

test.describe('state pseudo-classes (nwsapi installed)', () => {
  test(':open matches open <details>/<dialog> only', async ({ page }) => {
    await openFixtureWithNW(page)
    const result = await page.evaluate(() => {
      const ids = els => els.map(e => e.id)
      return {
        open: ids(window.NW.Dom.select(':open')),
        detailsOpen: ids(window.NW.Dom.select('details:open')),
        matchClosedDetails: window.NW.Dom.match(
          ':open',
          document.getElementById('d-closed'),
        ),
      }
    })
    expect(result.open).toEqual(['d-open', 'g-open'])
    expect(result.detailsOpen).toEqual(['d-open'])
    expect(result.matchClosedDetails).toBe(false)
  })

  test(':closed matches <details>/<dialog> without the open property', async ({
    page,
  }) => {
    await openFixtureWithNW(page)
    const result = await page.evaluate(() => {
      const ids = els => els.map(e => e.id)
      return {
        closed: ids(window.NW.Dom.select(':closed')),
        detailsClosed: ids(window.NW.Dom.select('details:closed')),
        matchOpenDetails: window.NW.Dom.match(
          ':closed',
          document.getElementById('d-open'),
        ),
        // :closed only applies to elements that have an open/closed state, so
        // a plain <div> is neither :open nor :closed.
        matchPlainDiv: window.NW.Dom.match(
          ':closed',
          document.getElementById('plain'),
        ),
      }
    })
    expect(result.closed).toEqual(['d-closed', 'g-closed'])
    expect(result.detailsClosed).toEqual(['d-closed'])
    expect(result.matchOpenDetails).toBe(false)
    expect(result.matchPlainDiv).toBe(false)
  })

  test(':current/:past/:future are valid but never match', async ({ page }) => {
    await openFixtureWithNW(page)
    const result = await page.evaluate(() => {
      const out = {}
      for (const selector of [':current', ':past', ':future', 'div:future']) {
        try {
          out[selector] = window.NW.Dom.select(selector).map(e => e.id)
        } catch (e) {
          out[selector] = `threw: ${String(e)}`
        }
      }
      return out
    })
    expect(result[':current']).toEqual([])
    expect(result[':past']).toEqual([])
    expect(result[':future']).toEqual([])
    expect(result['div:future']).toEqual([])
  })

  test(':fullscreen/:modal/:picture-in-picture follow document element pointers', async ({
    page,
  }) => {
    await openFixtureWithNW(page)
    const result = await page.evaluate(() => {
      const ids = els => els.map(e => e.id)
      const out: Record<string, string[]> = {
        fullscreenStatic: ids(window.NW.Dom.select(':fullscreen')),
        modalStatic: ids(window.NW.Dom.select(':modal')),
        pipStatic: ids(window.NW.Dom.select(':picture-in-picture')),
      }
      Object.defineProperty(document, 'fullscreenElement', {
        value: document.getElementById('g-open'),
        configurable: true,
      })
      out.fullscreenAfter = ids(window.NW.Dom.select(':fullscreen'))
      out.modalAfter = ids(window.NW.Dom.select(':modal'))
      Object.defineProperty(document, 'pictureInPictureElement', {
        value: document.getElementById('vid'),
        configurable: true,
      })
      out.pipAfter = ids(window.NW.Dom.select(':picture-in-picture'))
      return out
    })
    // Nothing is really fullscreen/PiP in a static fixture.
    expect(result.fullscreenStatic).toEqual([])
    expect(result.modalStatic).toEqual([])
    expect(result.pipStatic).toEqual([])
    // With document.fullscreenElement stubbed, both :fullscreen and :modal
    // (whose detectable half is the fullscreen flag) match exactly that node.
    expect(result.fullscreenAfter).toEqual(['g-open'])
    expect(result.modalAfter).toEqual(['g-open'])
    expect(result.pipAfter).toEqual(['vid'])
  })

  test(':open never matches in an XML document', async ({ page }) => {
    await openFixtureWithNW(page)
    const result = await page.evaluate(xmlSource => {
      const xdoc = new DOMParser().parseFromString(xmlSource, 'application/xml')
      const qsaResult = xdoc.querySelectorAll(':open')
      return {
        parserError: xdoc.getElementsByTagName('parsererror').length > 0,
        nwSelect: window.NW.Dom.select(':open', xdoc).length,
        // install() patches Document.prototype, so this goes through NW too
        // (native ground truth lives in the uninstrumented test below).
        qsaLength: qsaResult.length,
        qsaWentThroughNW:
          xdoc.querySelectorAll === document.querySelectorAll &&
          xdoc.querySelectorAll !== window['__nwNativeQuerySelectorAll'],
        qsaIsNodeList: qsaResult instanceof NodeList,
      }
    }, XML_SOURCE)
    expect(result.parserError).toBe(false)
    expect(result.qsaIsNodeList).toBe(true)
    expect(
      result.nwSelect,
      'NW.Dom.select(":open", xmlDoc) must match nothing',
    ).toBe(0)
    expect(
      result.qsaLength,
      'xdoc.querySelectorAll(":open") must match nothing',
    ).toBe(0)
    expect(
      result.qsaWentThroughNW,
      'NW override reaches XMLDocument via Document.prototype',
    ).toBe(true)
  })
})

test('native Chromium parity (no nwsapi): :open in HTML and XML', async ({
  page,
}) => {
  // No init script here: this page runs the native engine as ground truth.
  const response = await page.goto(FIXTURE)
  expect(response, `no HTTP response for ${FIXTURE}`).not.toBeNull()
  expect(response.ok(), `HTTP ${response.status()} for ${FIXTURE}`).toBe(true)
  const result = await page.evaluate(xmlSource => {
    const xdoc = new DOMParser().parseFromString(xmlSource, 'application/xml')
    return {
      qsaIsNative:
        typeof window.NW === 'undefined' &&
        document.querySelectorAll('html') instanceof NodeList,
      htmlOpen: Array.from(document.querySelectorAll(':open'), e => e.id),
      xmlOpen: xdoc.querySelectorAll(':open').length,
    }
  }, XML_SOURCE)
  expect(result.qsaIsNative, 'this page must run the native engine').toBe(true)
  expect(
    result.htmlOpen,
    'native :open agrees with nwsapi on the HTML fixture',
  ).toEqual(['d-open', 'g-open'])
  expect(
    result.xmlOpen,
    'native :open matches nothing in an XML document',
  ).toBe(0)
})

test('real media playback, seeking, muting and completion remain live after install', async ({
  page,
}) => {
  await page.goto(FIXTURE)
  await page.addScriptTag({ content: nwsapiSource })
  const result = await page.evaluate(async () => {
    // oxlint-disable-next-line typescript/unbound-method -- Called with the media receiver.
    const native = Element.prototype.matches
    const nw = window.NW.Dom
    nw.install()
    const audio = document.createElement('audio')
    document.body.appendChild(audio)
    const samples = 8000
    const bytes = new Uint8Array(44 + samples * 2)
    const view = new DataView(bytes.buffer)
    function text(offset, value) {
      for (let i = 0; i < value.length; i++) {
        bytes[offset + i] = value.charCodeAt(i)
      }
    }
    text(0, 'RIFF')
    text(8, 'WAVE')
    text(12, 'fmt ')
    text(36, 'data')
    view.setUint32(4, bytes.length - 8, true)
    view.setUint32(16, 16, true)
    view.setUint16(20, 1, true)
    view.setUint16(22, 1, true)
    view.setUint32(24, samples, true)
    view.setUint32(28, samples * 2, true)
    view.setUint16(32, 2, true)
    view.setUint16(34, 16, true)
    view.setUint32(40, samples * 2, true)
    const url = URL.createObjectURL(new Blob([bytes], { type: 'audio/wav' }))
    const event = name =>
      new Promise(resolve =>
        audio.addEventListener(name, resolve, { once: true }),
      )
    const parity = []
    function state(selector) {
      const actual = nw.match(selector, audio)
      try {
        parity.push([actual, native.call(audio, selector)])
      } catch {
        /* Native syntax can be unavailable. */
      }
      return actual
    }
    try {
      const ready = event('canplay')
      audio.src = url
      audio.muted = true
      await ready
      const initialPaused = state(':paused')
      await audio.play()
      const playing = state(':playing')
      const playingPaused = state(':paused')
      audio.pause()
      const paused = state(':paused')
      const sought = event('seeked')
      audio.currentTime = 0.5
      const seeking = state(':seeking')
      await sought
      const soughtState = state(':seeking')
      const muted = state(':muted')
      audio.muted = false
      audio.volume = 0
      const volumeZeroMuted = state(':muted')
      const ended = event('ended')
      await audio.play()
      await ended
      return {
        initialPaused,
        playing,
        playingPaused,
        paused,
        seeking,
        soughtState,
        muted,
        volumeZeroMuted,
        endedPaused: state(':paused'),
        endedPlaying: state(':playing'),
        parity,
      }
    } finally {
      audio.pause()
      audio.remove()
      URL.revokeObjectURL(url)
    }
  })
  const { parity, ...states } = result
  expect(states).toEqual({
    initialPaused: true,
    playing: true,
    playingPaused: false,
    paused: true,
    seeking: true,
    soughtState: false,
    muted: true,
    volumeZeroMuted: false,
    endedPaused: true,
    endedPlaying: false,
  })
  for (const [actual, expected] of parity) {
    expect(actual).toBe(expected)
  }
})
