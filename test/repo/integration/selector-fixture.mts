import { JSDOM, type DOMWindow } from 'jsdom'
import type { NwsapiEngine } from '../../../.config/runtime.js'
import factory from '../../../dist/nwsapi.js'
import { registerLegacy } from '../common/legacy.mts'

// The factory is stateful per document, so each test builds its own.
export function build(html: ConstructorParameters<typeof JSDOM>[0]) {
  const dom = new JSDOM(html)
  const { window } = dom
  const host = {
    document: window.document,
    DOMException: window.DOMException,
  }
  const NW = registerLegacy(factory(host))
  return { window, document: window.document, NW }
}

// A host whose Element.prototype.matches delegates to nwsapi, like jsdom's.
export function wireMatchesToNwsapi(window: DOMWindow, NW: NwsapiEngine) {
  let calls = 0
  window.Element.prototype.matches = function (
    this: Element,
    selector: string,
  ) {
    ++calls
    return NW.match(selector, this)
  } as Element['matches']
  return () => calls
}

export const STATE_PSEUDOS = [
  ':modal',
  ':fullscreen',
  ':picture-in-picture',
  ':open',
  ':closed',
]
