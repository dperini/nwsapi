import type { EngineState } from './state.d.ts'
import type { EngineElement, NativeMatcherRecord } from './types.mts'
export function isContentEditable(
  engine: EngineState,
  node: EngineElement,
): boolean {
  // designMode makes every connected element in this document editable,
  // including descendants with contenteditable=false.
  if (
    node.ownerDocument &&
    node.ownerDocument.designMode === 'on' &&
    engine.connectedOf(node)
  ) {
    return true
  }
  var attrValue: string | null = 'inherit'
  if (engine.hasAttrOf(node, 'contenteditable')) {
    attrValue = engine.attrOf(node, 'contenteditable')
  }
  switch (attrValue) {
    case '':
    case 'plaintext-only':
    case 'true':
      return true
    case 'false':
      return false
    default:
      if (node.parentNode && node.parentNode.nodeType === 1) {
        return engine.isContentEditable(node.parentNode as EngineElement)
      }
      return false
  }
}

export function isDisabled(engine: EngineState, element: EngineElement) {
  var legend,
    name = engine.tagOf(element),
    node

  if (element.disabled === true) {
    return true
  }

  // Options inherit disabled optgroups through ordinary wrappers, but
  // nested options, optgroups, selects, datalists, and rules bound the search.
  if (name == 'option') {
    node = engine.upOf(element)
    while (node) {
      name = engine.tagOf(node)
      if (name == 'optgroup') {
        if ((node as EngineElement).disabled === true) {
          return true
        }
        break
      }
      if (/^(?:option|select|datalist|hr)$/.test(name)) {
        break
      }
      node = engine.upOf(node)
    }
  }

  // any disabled fieldset above it, unless it sits in that fieldset's
  // first legend child, which excuses that fieldset and no other
  node = engine.upOf(element)
  while (node) {
    if (
      (node as EngineElement).disabled === true &&
      engine.tagOf(node) == 'fieldset'
    ) {
      legend = engine.firstOf(node)
      while (legend && engine.tagOf(legend) != 'legend') {
        legend = engine.nextOf(legend)
      }
      if (!(legend && legend.contains(element))) {
        return true
      }
    }
    node = engine.upOf(node)
  }

  return false
}

export function isFocusable(engine: EngineState, node: EngineElement) {
  var native = engine.Snapshot.matchesNative(node, ':focus', undefined),
    doc = node.ownerDocument
  if (native !== undefined) {
    return native ? node : false
  }
  if (node.contentDocument && engine.tagOf(node) == 'iframe') {
    return false
  }
  if (doc.hasFocus() && node === doc.activeElement) {
    if (node.type || node.href || typeof node.tabIndex == 'number') {
      return node
    }
  }
  return false
}

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

export function isOpen(engine: EngineState, node: EngineElement) {
  return (
    (/^(details|dialog)$/i.test(engine.tagOf(node)) && node.open === true) ||
    engine.matchesNative(node, ':open')
  )
}

export function isClosed(engine: EngineState, node: EngineElement) {
  return (
    (/^(details|dialog)$/i.test(engine.tagOf(node)) && node.open === false) ||
    engine.matchesNative(node, ':closed')
  )
}

export function fullscreenState(
  _engine: EngineState,
  node: EngineElement,
): boolean | undefined {
  var owner = node.ownerDocument,
    standard = owner && owner.fullscreenElement,
    webkit =
      owner &&
      (owner as Document & { webkitFullscreenElement?: Element })
        .webkitFullscreenElement,
    moz =
      owner &&
      (owner as Document & { mozFullScreenElement?: Element })
        .mozFullScreenElement,
    ms =
      owner &&
      (owner as Document & { msFullscreenElement?: Element })
        .msFullscreenElement
  if (standard === node || webkit === node || moz === node || ms === node) {
    return true
  }
  if (standard === null && !webkit && !moz && !ms) {
    return false
  }
  return undefined
}

export function isFullscreen(engine: EngineState, node: EngineElement) {
  var state = engine.fullscreenState(node)
  if (state === false) {
    return false
  }
  var native = engine.matchesNative(node, ':fullscreen', undefined)
  return native === undefined ? state === true : native
}

export function isModal(engine: EngineState, node: EngineElement) {
  var fullscreen = engine.fullscreenState(node)
  if (
    fullscreen === false &&
    node.namespaceURI === 'http://www.w3.org/1999/xhtml' &&
    engine.tagOf(node) !== 'dialog'
  ) {
    return false
  }
  var native = engine.matchesNative(node, ':modal', undefined)
  if (native !== undefined) {
    return native
  }
  return (
    fullscreen === true ||
    (fullscreen === undefined && engine.matchesNative(node, ':fullscreen'))
  )
}

export function isPictureInPicture(engine: EngineState, node: EngineElement) {
  var doc = node.ownerDocument
  return (
    !!(
      doc &&
      (doc.pictureInPictureElement === node ||
        node.webkitPresentationMode === 'picture-in-picture')
    ) || engine.matchesNative(node, ':picture-in-picture')
  )
}

export function isPopoverOpen(engine: EngineState, node: EngineElement) {
  return (
    engine.hasAttrOf(node, 'popover') &&
    engine.matchesNative(node, ':popover-open')
  )
}

export function isLink(engine: EngineState, node: EngineElement) {
  return (
    engine.reLinkName.test(engine.tagOf(node)) && engine.hasAttrOf(node, 'href')
  )
}

export function isMediaState(
  engine: EngineState,
  media: HTMLMediaElement,
  state: string,
): boolean {
  var native = engine.matchesNative(media, ':' + state, undefined)
  if (native !== undefined) {
    return native
  }
  if (
    media.namespaceURI !== 'http://www.w3.org/1999/xhtml' ||
    !/^(audio|video)$/i.test(engine.tagOf(media))
  ) {
    return false
  }
  switch (state) {
    case 'playing':
      return media.paused === false && media.ended !== true
    case 'paused':
      return media.paused === true || media.ended === true
    case 'seeking':
      return media.seeking === true
    case 'muted':
      return media.muted === true
    case 'buffering':
      return (
        engine.isMediaState(media, 'playing') &&
        media.networkState === 2 &&
        media.readyState < 3
      )
    default:
      return false
  }
}

export function configure(
  engine: EngineState,
  option: string | Record<string, unknown>,
  clear?: boolean,
) {
  if (typeof option == 'string') {
    return !!engine.Config[option]
  }
  if (typeof option != 'object') {
    return engine.Config
  }
  for (var i in option) {
    // Resolvers capture forgiving mode and quiet validation failures.
    if (
      (i == 'FORGIVING' || i == 'VERBOSITY') &&
      engine.Config[i] !== !!option[i]
    ) {
      clear = true
    }
    if (!engine.legacyHooks && i == 'LEGACY' && option[i]) {
      throw new TypeError(
        'Load modules/nwsapi-legacy.js before enabling LEGACY',
      )
    }
    if (i == 'LEGACY' && engine.Config[i] !== !!option[i]) {
      engine.matcherDoc = engine.matcherCache = null
      clear = true
    }
    engine.Config[i] = !!option[i]
  }
  // clear lambda cache
  if (clear) {
    engine.childPlans.clear()
    engine.typeRoutes.clear()
    engine.descentDeclined.clear()
    engine.matchLambdas.clear()
    engine.selectLambdas.clear()
    engine.matchResolvers.clear()
    engine.selectResolvers.clear()
    engine.firstResolvers.clear()
    engine.hasPlans = undefined
  }
  engine.useLegacy(engine.Config.LEGACY)
  engine.setIdentifierSyntax()
  return true
}
