import { afterEach, expect, test, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { JSDOM } from 'jsdom'
import {
  agentFavicon,
  brandAgentBrowser,
  installAgentFavicon,
} from '../../../../scripts/repo/lib/agent-browser.mts'
import { REPO_ROOT } from '../../../../scripts/repo/lib/paths.mts'

afterEach(() => vi.unstubAllGlobals())

test('a loaded document without a head defers favicon insertion safely', () => {
  const dom = new JSDOM('<title>Fixture</title>')
  vi.stubGlobal('document', dom.window.document)
  Object.defineProperty(dom.window.document, 'readyState', {
    value: 'complete',
  })
  dom.window.document.head.remove()
  installAgentFavicon('data:image/svg+xml,fixture')
  expect(dom.window.document.querySelector('link')).toBeNull()
  const head = dom.window.document.createElement('head')
  dom.window.document.documentElement.prepend(head)
  installAgentFavicon('data:image/svg+xml,fixture')
  expect(head.querySelectorAll('link')).toHaveLength(1)
  dom.window.close()
})

test('branding installs the generated SVG on existing and future pages', async () => {
  const href = agentFavicon()
  expect(Buffer.from(href.split(',')[1]!, 'base64').toString()).toBe(
    readFileSync(`${REPO_ROOT}/assets/repo/agent-favicon.svg`, 'utf8'),
  )
  const dom = new JSDOM('<title>Fixture</title>')
  vi.stubGlobal('document', dom.window.document)
  installAgentFavicon(href)
  dom.window.document.dispatchEvent(new dom.window.Event('DOMContentLoaded'))
  installAgentFavicon(href)
  expect(
    dom.window.document.querySelectorAll('#nwbox-agent-favicon'),
  ).toHaveLength(1)
  expect(dom.window.document.querySelector('link')?.href).toBe(href)
  const addInitScript = vi.fn()
  const evaluate = vi.fn()
  await brandAgentBrowser({
    addInitScript,
    pages: () => [{ evaluate }],
  } as unknown as Parameters<typeof brandAgentBrowser>[0])
  expect(addInitScript).toHaveBeenCalledWith(installAgentFavicon, href)
  expect(evaluate).toHaveBeenCalledWith(installAgentFavicon, href)
  dom.window.close()
})
