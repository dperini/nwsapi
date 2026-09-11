import { JSDOM, type BinaryData, type DOMWindow } from 'jsdom'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach } from 'vitest'
import type factory from '../../../../dist/nwsapi.js'
import { registerLegacy } from '../../common/legacy.mts'
import { legacyHost } from '../../common/fixture/legacy-host.mts'

const require = createRequire(import.meta.url)

const here = path.dirname(fileURLToPath(import.meta.url))

export const nwsapiPath = path.resolve(
  here,
  '..',
  '..',
  '..',
  '..',
  'dist',
  'nwsapi.js',
)

export const engineFactory: typeof factory = require(nwsapiPath)

export const MARKUP =
  '<!doctype html><html><body>' +
  '<div id=d1 class="box wide" data-k="v" title="a b">' +
  '<p id=p1 class="a first">one</p>' +
  '<p id=p2 class="b">two</p>' +
  '<p id=p3 class="a last">three</p>' +
  '<a id=a1 href="./go" for="x" title="hello-world">link</a>' +
  '<span id=s1></span>' +
  '</div>' +
  '<div id=d2 class="box">' +
  '<ul id=u1><li id=l1>1</li><li id=l2 class="row">2</li><li id=l3>3</li></ul>' +
  '<form id=f1><input id=i1 type=checkbox checked><input id=i2 disabled></form>' +
  '</div>' +
  '<div id=d3 style="color:red"><em id=e1>e</em></div>' +
  '</body></html>'

// Every shape the engine compiles differently, so the legacy reads are all
// exercised: tags, classes, ids, attributes with each operator, the four
// combinators, the structural pseudo-classes, the logical ones and lists.
export const SELECTORS = [
  'div',
  '*',
  'p',
  'em',
  '.box',
  '.a',
  '.row',
  'p.a',
  'div.box.wide',
  ':not(.box)',
  '#d1',
  '#p2',
  'div#d2',
  '#d1 p',
  '[data-k]',
  '[data-k="v"]',
  '[data-k^="v"]',
  '[data-k$="v"]',
  '[data-k*="="]',
  '[title~="b"]',
  '[title|="hello"]',
  '[title="A B" i]',
  '[for="x"]',
  'a[href]',
  'input[checked]',
  'input[disabled]',
  'div[style]',
  'div p',
  'div > p',
  'p + p',
  'p ~ p',
  'ul li',
  'div ul li',
  'body div p',
  'p:first-child',
  'p:last-child',
  'span:only-child',
  'li:first-child',
  'p:first-of-type',
  'p:last-of-type',
  'em:only-of-type',
  'p:nth-child(1)',
  'p:nth-child(2)',
  'p:nth-child(2n)',
  'p:nth-child(odd)',
  'li:nth-child(3)',
  'li:nth-last-child(1)',
  'p:nth-of-type(2)',
  'p:nth-last-of-type(1)',
  'p:not(.a)',
  'p:not(:first-child)',
  'div:is(.box)',
  'div:where(#d1, #d2)',
  'div:has(p)',
  'div:has(> ul)',
  'span:empty',
  ':root',
  'html body',
  'p, span',
  'li, em',
  'div.box, .row',
]

export const windows: DOMWindow[] = []

afterEach(() => {
  for (const window of windows.splice(0)) {
    window.close()
  }
})

export function build(
  markup: string | Buffer | BinaryData | undefined,
  options = {},
) {
  const dom = new JSDOM(markup)
  windows.push(dom.window)
  const { window } = dom
  const host = legacyHost(window.document, options)
  const NW = registerLegacy(
    engineFactory({
      document: host,
      DOMException: window.DOMException,
    }),
  )
  return { window, host, document: window.document, NW }
}

export function buildModern(markup: string | Buffer | BinaryData | undefined) {
  const dom = new JSDOM(markup)
  windows.push(dom.window)
  const NW = registerLegacy(
    engineFactory({
      document: dom.window.document,
      DOMException: dom.window.DOMException,
    }),
  )
  return { window: dom.window, document: dom.window.document, NW }
}

export const ids = (nodes: ArrayLike<Element>) =>
  Array.from(nodes, node => node.id || node.nodeName.toLowerCase())
