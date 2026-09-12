import type { EngineState } from '../state/engine.d.ts'
export function tagOf(_engine: EngineState, e: Element) {
  return e.localName
}

export function idOf(_engine: EngineState, e: Element) {
  return e.id
}

export function firstOf(_engine: EngineState, e: ParentNode) {
  return e.firstElementChild
}

export function attrNamesOf(_engine: EngineState, e: Element) {
  return e.getAttributeNames()
}

export function connectedOf(_engine: EngineState, e: Node) {
  return e.isConnected
}

export function useLegacy(engine: EngineState, on: boolean) {
  var readers = on ? engine.legacyHooks! : engine.modernReaders,
    name
  if (on) {
    engine.legacyHooks!.initialize(engine.doc)
  }
  engine.includes = readers.includes
  engine.attrOf = readers.attrOf
  engine.hasAttrOf = readers.hasAttrOf
  engine.tagOf = readers.tagOf
  engine.idOf = readers.idOf
  engine.upOf = readers.upOf
  engine.nextOf = readers.nextOf
  engine._prevOf = readers.prevOf
  engine.firstOf = readers.firstOf
  engine.attrNamesOf = readers.attrNamesOf
  engine.connectedOf = readers.connectedOf
  for (name in engine.modernReaders) {
    ;(engine.Snapshot as unknown as Record<string, unknown>)[name] = (
      readers as unknown as Record<string, unknown>
    )[name]
  }
}

export function classOf(engine: EngineState, e: Element) {
  var value = e.className as string | SVGAnimatedString
  if (typeof value == 'string') {
    return value
  }
  // an SVGAnimatedString carries the markup in baseVal, which is cheaper
  // to read than asking for the attribute again
  if (value && typeof value.baseVal == 'string') {
    return value.baseVal
  }
  return engine.attrOf(e, 'class') || ''
}
