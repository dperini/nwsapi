import type { EngineState } from './state.d.ts'
import type {
  EngineContext,
  EngineElement,
  FilteredNthState,
} from './types.mts'
export function byClass(
  engine: EngineState,
  cls: string,
  context: EngineContext,
) {
  var e: Element | null,
    nodes: Element[],
    api = engine.method['.'],
    reCls: RegExp
  if (engine.Config.LEGACY) {
    nodes = engine.legacyHooks!.byClass(cls, context)
  } else if (api in context) {
    return engine.collectionCopy(context[api]!(cls), context)
  } else {
    // DOCUMENT_FRAGMENT_NODE (11)
    if ((e = context.firstElementChild)) {
      reCls = RegExp('(^|\\s)' + cls + '(\\s|$)', engine.QUIRKS_MODE ? 'i' : '')
      if (!(e.nextElementSibling || reCls.test(e.className))) {
        return engine.sliceCall(e[api](cls))
      } else {
        nodes = []
        do {
          if (reCls.test(e.className)) {
            nodes[nodes.length] = e
          }
          engine.concatList(nodes, e[api](cls))
        } while ((e = e.nextElementSibling))
      }
    } else {
      nodes = engine.none
    }
  }
  return !engine.Config.NODE_LIST
    ? nodes
    : engine.isInstanceOf(nodes)
      ? nodes
      : engine.toNodeList(nodes)
}

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

export function nthFiltered(
  engine: EngineState,
  element: Element,
  selector: string,
  reverse: boolean,
  state: FilteredNthState | null,
) {
  var parent = element.parentNode || element,
    siblings =
      state &&
      (state.parent === parent
        ? state.siblings
        : state.parents && state.parents.get(parent)),
    resolvers,
    child,
    index
  {
    siblings = collectFilteredSiblings()
  }
  if (state) {
    state.parent = parent
    state.siblings = siblings
  }
  index = siblings.positions
    ? siblings.positions.get(element) || 0
    : siblings.nodes.indexOf(element) + 1
  return index && reverse ? siblings.nodes.length - index + 1 : index

  function collectFilteredSiblings() {
    if (!siblings) {
      siblings = { nodes: [], positions: engine.createWeakMap() }
      resolvers = engine.matchResolvers.get('false:' + selector)
      if (!resolvers) {
        resolvers = engine.match_collect(
          engine.parse(selector, false) as string[],
          undefined,
        )
        engine.matchResolvers.set('false:' + selector, resolvers)
      }
      child = element.parentNode ? engine.firstOf(parent) : element
      while (child) {
        if (engine.match_assert(resolvers, child, undefined)) {
          siblings.nodes[siblings.nodes.length] = child
          siblings.positions &&
            siblings.positions.set(child, siblings.nodes.length)
        }
        child = engine.nextOf(child)
      }
      if (state) {
        state.parents || (state.parents = engine.createWeakMap())
        state.parents && state.parents.set(parent, siblings)
      }
    }
    return siblings
  }
}

export function tagBit(engine: EngineState, name: string) {
  if (engine.HTML_DOCUMENT) {
    name = engine.asciiLower(name)
  }
  var i = 0,
    l = name.length,
    h = 0,
    bit = engine.tagBits[name]
  if (bit !== undefined) {
    return bit
  }
  for (; l > i; ++i) {
    h = (h * 31 + name.charCodeAt(i)) | 0
  }
  return (engine.tagBits[name] = 1 << (h & 31))
}

export function ancestorMask(engine: EngineState, node: EngineElement) {
  if (engine.ancestorMasks === null) {
    engine.ancestorMasks = engine.createWeakMap()
  }
  var i: number,
    mask,
    chain = [],
    parent = node.parentElement

  if (parent === engine.lastMaskNode) {
    return engine.lastMaskValue
  }

  // walk up to the nearest ancestor already summarized, iteratively: a
  // recursive form would be bounded by the stack, not by the document
  while (parent) {
    mask = engine.ancestorMasks!.get(parent)
    if (mask !== undefined) {
      break
    }
    chain[chain.length] = parent
    parent = parent.parentElement
  }

  mask = mask === undefined ? 0 : mask | engine.tagBit(parent!.localName)

  // then back down, summarizing each ancestor on the way
  for (i = chain.length - 1; i > -1; --i) {
    engine.ancestorMasks!.set(chain[i]!, mask)
    mask |= engine.tagBit(chain[i]!.localName)
  }

  engine.lastMaskNode = node.parentElement
  engine.lastMaskValue = mask

  return mask
}

export function mayMatch(
  engine: EngineState,
  node: EngineElement,
  mask: number,
  state: { rest: number; kept: number; seen: number },
) {
  // switched off for this selector, and counting down to another look:
  // a document can change shape between one query and the next
  if (state.rest > 0) {
    --state.rest
    return true
  }

  var keep = (engine.ancestorMask(node) & mask) === mask

  if (keep) {
    ++state.kept
  }
  if (++state.seen === engine.FILTER_SAMPLE) {
    if (state.kept >= engine.FILTER_KEEP) {
      state.rest = engine.FILTER_RETRY
    }
    state.seen = 0
    state.kept = 0
  }

  return keep
}

export function clearAncestorMasks(engine: EngineState) {
  engine.ancestorMasks = null
  engine.lastMaskNode = null
  engine.lastMaskValue = 0
  return true
}

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
