import type {
  EngineState,
  EngineElement,
  EngineContext,
} from '../state/types.mts'

export function isRadioGroupChecked(
  engine: EngineState,
  element: EngineElement,
) {
  var radio = element as HTMLInputElement,
    name = radio.name,
    form = radio.form,
    root: Node = element,
    peers: ArrayLike<Element>,
    peer: HTMLInputElement

  if (!name) {
    return false
  }
  while (root.parentNode) {
    root = root.parentNode
  }
  peers = form ? form.elements : engine.byTag('input', root as EngineContext)
  if (!form && root.nodeType == 1 && root !== element) {
    peer = root as HTMLInputElement
    if (isCheckedRadio(peer, element, name, form, root)) {
      return true
    }
  }
  for (var index = 0, length = peers.length; index < length; index++) {
    peer = peers[index] as HTMLInputElement
    if (isCheckedRadio(peer, element, name, form, root)) {
      return true
    }
  }
  return false
}

function isCheckedRadio(
  peer: HTMLInputElement,
  element: Element,
  name: string,
  form: HTMLFormElement | null,
  root: Node,
) {
  var peerRoot: Node = peer
  if (
    peer === element ||
    peer.type !== 'radio' ||
    peer.name !== name ||
    peer.form !== form ||
    !peer.checked
  ) {
    return false
  }
  while (peerRoot.parentNode) {
    peerRoot = peerRoot.parentNode
  }
  return peerRoot === root
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
