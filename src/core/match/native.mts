import type { EngineState } from '../state/engine.d.ts'
import type { EngineElement, NativeMatcherRecord } from '../state/types.mts'
export function matchesNative(
  engine: EngineState,
  node: EngineElement,
  selector: string,
  unavailable?: boolean | undefined,
) {
  var view: (Window & typeof globalThis) | null,
    proto: Element | null,
    matcher: NativeMatcherRecord['matcher'],
    ownerDoc = node.ownerDocument || engine.doc
  if (arguments.length - 1 < 3) {
    unavailable = false
  }
  // Record delegation before doing any lookup. Nested calls must not
  // replace the document record belonging to the outer matcher.
  if (engine.matchingNative) {
    engine.matchingNative.delegates = true
    return unavailable
  }
  prepareMatcherRecord()
  // Host methods can change after setup, including element overrides.
  // Retain delegation only while the selected function stays the same.
  matcher =
    engine._matches ||
    ((ownerDoc.defaultView ||
      engine.primordials.ObjectPrototypeHasOwnProperty(node, 'matches')) &&
      node.matches) ||
    (engine.ELEMENT_PROTO && engine.ELEMENT_PROTO.matches)
  {
    resolveFallbackMatcher()
  }
  if (matcher !== engine.matcherRecord!.matcher) {
    engine.matcherRecord!.matcher = matcher
    engine.matcherRecord!.delegates = false
  }
  if (!matcher || engine.matcherRecord!.delegates) {
    return unavailable
  }
  try {
    engine.matchingNative = engine.matcherRecord!
    var result = matcher.call(node, selector)
    return engine.matchingNative!.delegates ? unavailable : result
  } catch (e) {
    return unavailable
  } finally {
    engine.matchingNative = null
  }

  function prepareMatcherRecord() {
    if (ownerDoc !== engine.matcherDoc) {
      if (engine.matcherCache === null) {
        engine.matcherCache = engine.createWeakMap()
      }
      engine.matcherDoc = ownerDoc
      engine.matcherRecord =
        engine.matcherCache && engine.matcherCache.get(ownerDoc)
      if (!engine.matcherRecord) {
        engine.matcherRecord = {
          fallback: null,
          matcher: undefined,
          delegates: false,
        }
        if (engine.matcherCache) {
          engine.matcherCache.set(ownerDoc, engine.matcherRecord)
        }
      }
    }
  }

  function resolveFallbackMatcher() {
    if (!matcher && engine.Config.LEGACY) {
      if (engine.matcherRecord!.fallback === null) {
        view = ownerDoc.defaultView
        proto = view && view.Element && view.Element.prototype
        engine.matcherRecord!.fallback =
          engine.legacyHooks!.matcher(proto) ||
          (proto !== engine.ELEMENT_PROTO
            ? engine.legacyHooks!.matcher(engine.ELEMENT_PROTO)
            : undefined)
      }
      matcher = engine.matcherRecord!.fallback
    }
  }
}
