import type { LegacyContext } from '../../core/state/legacy.mts'
type EngineElement = Element & { style?: CSSStyleDeclaration }

export function createAttributes(context: LegacyContext) {
  var LEGACY_NAMES: Record<string, string> = {
      accesskey: 'accessKey',
      cellpadding: 'cellPadding',
      cellspacing: 'cellSpacing',
      class: 'className',
      colspan: 'colSpan',
      contenteditable: 'contentEditable',
      for: 'htmlFor',
      frameborder: 'frameBorder',
      maxlength: 'maxLength',
      readonly: 'readOnly',
      rowspan: 'rowSpan',
      tabindex: 'tabIndex',
      usemap: 'useMap',
      valign: 'vAlign',
    },
    LEGACY_URLS: Record<string, number> = {
      action: 1,
      background: 1,
      cite: 1,
      classid: 1,
      codebase: 1,
      data: 1,
      href: 1,
      longdesc: 1,
      profile: 1,
      src: 1,
      usemap: 1,
    },
    LEGACY_URL_READ = 'flag',
    LEGACY_PROBE = './nwsapi-probe',
    probeAttributes = function (document: Document) {
      var element, node

      LEGACY_URL_READ = 'flag'
      try {
        element = document.createElement('a')
        element.setAttribute('href', LEGACY_PROBE)
        if (
          (element.getAttribute as (name: string, flag: number) => unknown)(
            'href',
            2,
          ) === LEGACY_PROBE
        ) {
          return
        }
        node =
          element.attributes &&
          element.attributes.getNamedItem &&
          element.attributes.getNamedItem('href')
        if (
          node &&
          (node.value === LEGACY_PROBE || node.nodeValue === LEGACY_PROBE)
        ) {
          LEGACY_URL_READ = 'node'
          return
        }
        if (element.getAttribute('href') === LEGACY_PROBE) {
          LEGACY_URL_READ = 'plain'
        }
        // nothing answered the markup, so the second argument stays the best
        // of the three: it is what the host most likely to resolve took
      } catch (e) {
        // a host that cannot create an element is not one to probe
      }
    },
    legacyAttrNode = function (e: Element, lower: string) {
      var attrs = e.attributes as NamedNodeMap &
          Record<string, Attr | undefined>,
        node
      if (!attrs) {
        return null
      }
      node = attrs.getNamedItem ? attrs.getNamedItem(lower) : attrs[lower]
      if (!node && LEGACY_NAMES[lower]!) {
        node = attrs.getNamedItem
          ? attrs.getNamedItem(LEGACY_NAMES[lower]!)
          : attrs[LEGACY_NAMES[lower]!]
      }
      return node || null
    },
    readUrl = function (e: Element, name: string, node: Attr | null): unknown {
      var value: unknown
      if (LEGACY_URL_READ == 'node' && node) {
        value = node.value !== undefined ? node.value : node.nodeValue
      } else {
        value =
          LEGACY_URL_READ == 'plain'
            ? e.getAttribute(name)
            : (e.getAttribute as (name: string, flag: number) => unknown)(
                name,
                2,
              )
      }
      if (typeof value == 'string') {
        return value
      }

      return undefined
    },
    attributeText = function (e: EngineElement, lower: string, value: unknown) {
      if (typeof value == 'string') {
        return value
      }
      // a style attribute came back as an object and an event handler as a
      // function
      if (lower == 'style') {
        return e.style ? e.style.cssText : null
      }
      // A boolean attribute came back as the property's true or false. Read
      // as '' when it is present, which is the markup of '<input checked>'
      // and the only answer available: this host cannot say whether the
      // markup wrote 'checked' or 'checked="checked"', a loss Mark documents
      // under "Booleans" and settles the same way.
      if (value === true) {
        return ''
      }
      if (value === false) {
        return null
      }
      // oxlint-disable-next-line typescript/no-base-to-string -- Legacy hosts may return nonstring attributes.
      return String(value)
    },
    readAttributeValue = function (
      e: Element,
      name: string,
      lower: string,
      node: Attr | null,
    ) {
      var value: unknown
      if (e.getAttribute) {
        value = e.getAttribute(name)
        if (value == null && LEGACY_NAMES[lower]!) {
          value = e.getAttribute(LEGACY_NAMES[lower]!)
        }
      }
      if (value == null && node) {
        value = node.value !== undefined ? node.value : node.nodeValue
      }

      return value
    },
    legacyAttrOf = function (e: EngineElement, name: string) {
      var lower, node, value: unknown

      if (!e || e.nodeType != 1) {
        return null
      }
      lower = name.toLowerCase()
      node = legacyAttrNode(
        e,
        context.isHTML() &&
          (!e.namespaceURI || e.namespaceURI == 'http://www.w3.org/1999/xhtml')
          ? lower
          : name,
      )

      // Presence is the attribute node's to answer, not the property's. A
      // property default is not an attribute, and IE 6 and 7 answered
      // getAttribute('enctype') with the form default when the markup had set
      // nothing at all (Mark, "Known Exceptions"). Where the host keeps an
      // attributes collection, that collection decides.
      if (e.attributes && (!node || node.specified === false)) {
        return null
      }

      if (LEGACY_URLS[lower] && typeof e.getAttribute == 'function') {
        value = readUrl(e, name, node)
        if (typeof value == 'string') {
          return value
        }
      }

      value = readAttributeValue(e, name, lower, node)
      if (value == null) {
        return null
      }

      return attributeText(e, lower, value)
    },
    legacyHasAttrOf = function (e: Element, name: string) {
      if (!e || e.nodeType != 1) {
        return false
      }
      if (e.hasAttribute) {
        return e.hasAttribute(name)
      }
      return legacyAttrOf(e, name) !== null
    }
  return { probeAttributes, legacyAttrOf, legacyHasAttrOf }
}
