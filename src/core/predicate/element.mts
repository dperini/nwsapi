import type { EngineState } from '../state/engine.d.ts'
import type { EngineElement } from '../state/types.mts'
export function isHTML(_engine: EngineState, node: Node) {
  var doc = (node.ownerDocument || node) as Document
  return doc.nodeType == 9 &&
    // contentType not in IE <= 11
    'contentType' in doc
    ? doc.contentType.indexOf('/html') > 0
    : doc.createElement('DiV').localName == 'div'
}

export function isDefined(engine: EngineState, element: EngineElement) {
  var native: boolean | undefined,
    custom: CustomElementConstructor | undefined,
    name = engine.tagOf(element),
    registry: CustomElementRegistry | null,
    view: (Window & typeof globalThis) | null

  if (element.namespaceURI !== 'http://www.w3.org/1999/xhtml') {
    return true
  }
  native = engine.matchesNative(element, ':defined', undefined)
  if (native !== undefined) {
    return native
  }
  if (name.indexOf('-') < 0) {
    if (!engine.hasAttrOf(element, 'is')) {
      return true
    }
    name = engine.attrOf(element, 'is') || name
  }

  view = element.ownerDocument.defaultView
  registry = view && view.customElements
  if (!registry || !registry.get) {
    return false
  }
  custom = registry.get(name)
  return !!custom && element instanceof custom
}

export function isRequired(engine: EngineState, node: EngineElement) {
  return (
    !!node.required &&
    (/^(select|textarea)$/.test(engine.tagOf(node)) ||
      (engine.tagOf(node) == 'input' &&
        !/^(hidden|range|color|button|submit|reset|image)$/.test(node.type!)))
  )
}
