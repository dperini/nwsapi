import type { EngineState } from '../state/types.mts'
export function attributeValueNS(
  engine: EngineState,
  e: Element,
  name: string,
) {
  if (e.getAttributeNS) {
    return e.getAttributeNS(null, name)
  }
  var attribute = e.getAttributeNode && e.getAttributeNode(name)
  return attribute && attribute.namespaceURI ? null : engine.attrOf(e, name)
}

export function hasAttributeNS(
  engine: EngineState,
  e: Element,
  name: string,
  pattern?: RegExp,
  expected?: boolean,
) {
  var i: number,
    l: number,
    local: string,
    attribute: Attr | null,
    attr = engine.attrNamesOf(e)
  if (engine.HTML_DOCUMENT) {
    name = name.toLowerCase()
  }
  for (i = 0, l = attr.length; l > i; ++i) {
    local = attr[i]!
    if (local.indexOf(':') >= 0) {
      attribute = e.getAttributeNode && e.getAttributeNode(local)
      local =
        attribute && attribute.localName
          ? attribute.localName
          : local.slice(local.indexOf(':') + 1)
    }
    if (
      (engine.HTML_DOCUMENT ? local.toLowerCase() : local) == name &&
      (!pattern || pattern.test(engine.attrOf(e, attr[i]!)!) === expected)
    ) {
      return true
    }
  }
  return false
}
