import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'
import { afterEach, test, vi } from 'vitest'
import type { Browser } from '@playwright/test'

const bundle = vi.hoisted(() => ({
  generate: vi.fn(),
  close: vi.fn(),
  build: vi.fn(),
}))
vi.mock('rolldown', () => ({ rolldown: bundle.build }))
import {
  nativePage,
  nativeSources,
} from '../../../../../scripts/repo/bench/native/host.mts'
import type { NativeGlobals } from '../../../../../scripts/repo/bench/native/host.mts'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

test('native sources require one standalone chunk and close the bundler on every outcome', async () => {
  bundle.build.mockResolvedValue(bundle)
  bundle.generate.mockResolvedValue({
    output: [
      { type: 'chunk', imports: [], code: 'globalThis.__competitor={};' },
    ],
  })
  const sources = await nativeSources('competitor.mjs')
  assert.equal(sources.competitor, 'globalThis.__competitor={};')
  assert.equal(sources.competitorBundleSha256.length, 64)
  assert.equal(bundle.close.mock.calls.length, 1)
  const failures = [
    [],
    [{ type: 'asset' }],
    [{ type: 'chunk', imports: ['external'] }],
    [
      { type: 'chunk', imports: [] },
      { type: 'chunk', imports: [] },
    ],
  ]
  for (let index = 0, length = failures.length; index < length; index += 1) {
    bundle.generate.mockResolvedValue({ output: failures[index] })
    await assert.rejects(nativeSources())
  }
  bundle.generate.mockRejectedValue(new Error('bundling failed'))
  await assert.rejects(nativeSources())
  assert.equal(bundle.close.mock.calls.length, 6)
})

test('native page provisions isolated fixtures and adapters for both engines', async () => {
  const dom = new JSDOM('<body></body>')
  vi.stubGlobal('window', dom.window)
  vi.stubGlobal('document', dom.window.document)
  vi.stubGlobal('crossOriginIsolated', true)
  const host = dom.window as unknown as NativeGlobals
  host.__nwsapiFactory = () => ({
    select: (selector, document) => document.querySelectorAll(selector),
    first: (selector, document) => document.querySelector(selector),
  })
  host.__competitor = {
    DOMSelector: class {
      querySelectorAll(selector: string, document: Document) {
        return Array.from(document.querySelectorAll(selector))
      }
      querySelector(selector: string, document: Document) {
        return document.querySelector(selector)
      }
    },
  }
  const fulfill = vi.fn()
  const page = {
    route: vi.fn(async (_pattern, handler) => handler({ fulfill })),
    goto: vi.fn(),
    addScriptTag: vi.fn(),
    evaluate: vi.fn(async callback => callback()),
  }
  const browser = { newPage: vi.fn(async () => page) } as unknown as Browser
  const sources = {
    candidate: 'candidate',
    competitor: 'competitor',
    competitorBundleSha256: 'hash',
  }
  try {
    assert.equal(await nativePage(browser, sources), page)
    assert.equal(
      fulfill.mock.calls[0]![0].headers['Cross-Origin-Embedder-Policy'],
      'require-corp',
    )
    for (let engine = 0; engine < 2; engine += 1) {
      const context = host.__createContext(
        '<body><i class="a"></i></body>',
        engine,
      )
      assert.equal(context.all('.a').length, 1)
      assert.equal(context.first('.a'), context.document.querySelector('.a'))
      context.frame.remove()
    }
    const cold = host.__createContext('<body></body>', 0, false)
    assert.throws(() => cold.all('.a'))
    assert.throws(() => cold.first('.a'))
    cold.frame.remove()
    vi.stubGlobal('crossOriginIsolated', false)
    await assert.rejects(nativePage(browser, sources))
  } finally {
    dom.window.close()
  }
})
