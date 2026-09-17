import type { EngineState, EngineElement } from '../state/types.mts'

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
