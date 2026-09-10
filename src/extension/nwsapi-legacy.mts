/*
 * Optional DOM compatibility hooks for nwsapi.
 * Load after the core and before querying or loading other optional modules.
 */
// Keep this optional module a script for CommonJS, AMD, and browser loading.
type LegacyContext = import('../core/legacy.d.ts').LegacyContext
type LegacyHooks = import('../core/legacy.d.ts').LegacyHooks
type PlanCache<Value> = import('../core/legacy.d.ts').LegacyCache<Value>
type EngineElement = Element & { style?: CSSStyleDeclaration }
interface LegacyCacheEntry<Value> {
  key: string
  value: Value
  prev: LegacyCacheEntry<Value> | null
  next: LegacyCacheEntry<Value> | null
}

;(function (install) {
  if (typeof module == 'object' && typeof exports == 'object') {
    module.exports = install
  } else if (typeof define == 'function' && define.amd) {
    define(() => install)
  } else {
    install(NW.Dom)
  }
})(function installLegacy(engine: typeof NW.Dom) {
  engine.registerLegacyHooks(createLegacyHooks)
  return engine

  function createLegacyHooks(context: LegacyContext): LegacyHooks {
    var CACHE_LIMIT = 4096,
      hasStringIncludes = !!context.StringPrototypeIncludes,
      uncurryThis = Function.prototype.bind.bind(Function.prototype.call),
      StringPrototypeIndexOf = uncurryThis(String.prototype.indexOf),
      ObjectPrototypeHasOwnProperty = uncurryThis(
        Object.prototype.hasOwnProperty,
      ),
      createLegacyCache = function <Value>(
        limit?: number,
      ): PlanCache<Value> & { has(key: string): boolean } {
        var cache: Record<string, LegacyCacheEntry<Value>> = {},
          head: LegacyCacheEntry<Value> | null = null,
          tail: LegacyCacheEntry<Value> | null = null,
          size = 0,
          prefix = '\x01',
          has = function (key: string) {
            return ObjectPrototypeHasOwnProperty(cache, prefix + key)
          },
          unlink = function (entry: LegacyCacheEntry<Value>) {
            entry.prev ? (entry.prev.next = entry.next) : (head = entry.next)
            entry.next ? (entry.next.prev = entry.prev) : (tail = entry.prev)
          },
          link = function (entry: LegacyCacheEntry<Value>) {
            entry.prev = tail
            entry.next = null
            tail ? (tail.next = entry) : (head = entry)
            tail = entry
          },
          promote = function (entry: LegacyCacheEntry<Value>) {
            if (entry !== tail) {
              unlink(entry)
              link(entry)
            }
          },
          remove = function (entry: LegacyCacheEntry<Value>) {
            unlink(entry)
            delete cache[entry.key]
            --size
          }

        limit || (limit = CACHE_LIMIT)

        return {
          clear: function () {
            cache = {}
            head = tail = null
            size = 0
          },
          get: function (key: string) {
            var entry
            if (!has(key)) {
              return undefined
            }
            entry = cache[prefix + key]!
            promote(entry)
            return entry.value
          },
          has: function (key: string) {
            return has(key)
          },
          set: function (key: string, value: Value) {
            var entry,
              entryKey = prefix + key

            if (has(key)) {
              entry = cache[entryKey]!
              entry.value = value
              promote(entry)
            } else {
              size >= limit && remove(head!)
              entry = { key: entryKey, value: value, prev: null, next: null }
              cache[entryKey] = entry
              link(entry)
              ++size
            }
            return value
          },
          size: function () {
            return size
          },
        }
      },
      LEGACY_NAMES: Record<string, string> = {
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
      legacyAttrOf = function (e: EngineElement, name: string) {
        var lower, node, value: unknown

        if (!e || e.nodeType != 1) {
          return null
        }
        lower = name.toLowerCase()
        node = legacyAttrNode(
          e,
          context.isHTML() &&
            (!e.namespaceURI ||
              e.namespaceURI == 'http://www.w3.org/1999/xhtml')
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

        // A URL attribute, read the way this host answers the markup.
        if (LEGACY_URLS[lower] && e.getAttribute) {
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
        }

        if (e.getAttribute) {
          value = e.getAttribute(name)
          if (value == null && LEGACY_NAMES[lower]!) {
            value = e.getAttribute(LEGACY_NAMES[lower]!)
          }
        }
        if (value == null && node) {
          value = node.value !== undefined ? node.value : node.nodeValue
        }
        if (value == null) {
          return null
        }

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
      legacyHasAttrOf = function (e: Element, name: string) {
        if (!e || e.nodeType != 1) {
          return false
        }
        if (e.hasAttribute) {
          return e.hasAttribute(name)
        }
        return legacyAttrOf(e, name) !== null
      },
      legacyTagOf = function (e: Element) {
        if (!e) {
          return ''
        }
        if (typeof e.localName == 'string') {
          return e.localName
        }
        // nodeName is upper case for an HTML element and carries the prefix in
        // XML, so the part after a colon is the local name
        var name = e.nodeName
        if (typeof name != 'string') {
          return ''
        }
        name = name.slice(name.indexOf(':') + 1)
        return context.isHTML() ? name.toLowerCase() : name
      },
      legacyIdOf = function (e: Element) {
        var value = e && e.id
        if (typeof value == 'string' && legacyTagOf(e) != 'form') {
          return value
        }
        return legacyAttrOf(e, 'id') || ''
      },
      legacyClassOf = function (e: Element) {
        var value = e && (e.className as string | SVGAnimatedString)
        if (typeof value == 'string') {
          return value
        }
        if (value && typeof value.baseVal == 'string') {
          return value.baseVal
        }
        return legacyAttrOf(e, 'class') || ''
      },
      legacyUpOf = function (e: Element): Element | null {
        var node: Node | null = e.parentElement
        if (node !== undefined) {
          return node as Element | null
        }
        node = e.parentNode
        return node && node.nodeType == 1 ? (node as Element) : null
      },
      legacyNextOf = function (e: Element): Element | null {
        var node: Node | null = e.nextElementSibling
        if (node !== undefined) {
          return node as Element | null
        }
        node = e.nextSibling
        while (node && node.nodeType != 1) {
          node = node.nextSibling
        }
        return (node as Element | null) || null
      },
      legacyPrevOf = function (e: Element): Element | null {
        var node: Node | null = e.previousElementSibling
        if (node !== undefined) {
          return node as Element | null
        }
        node = e.previousSibling
        while (node && node.nodeType != 1) {
          node = node.previousSibling
        }
        return (node as Element | null) || null
      },
      legacyFirstOf = function (e: ParentNode): Element | null {
        var node: Node | null = e.firstElementChild
        if (node !== undefined) {
          return node as Element | null
        }
        node = e.firstChild
        while (node && node.nodeType != 1) {
          node = node.nextSibling
        }
        return (node as Element | null) || null
      },
      legacyAttrNamesOf = function (e: Element) {
        var i,
          l,
          names = [],
          attrs
        if (e.getAttributeNames) {
          return e.getAttributeNames()
        }
        attrs = e.attributes
        for (i = 0, l = attrs ? attrs.length : 0; l > i; ++i) {
          if (
            attrs[i] &&
            (attrs[i]!.specified === undefined || attrs[i]!.specified)
          ) {
            names[names.length] =
              attrs[i]!.name !== undefined ? attrs[i]!.name : attrs[i]!.nodeName
          }
        }
        return names
      },
      legacyConnectedOf = function (e: Node) {
        var node = e
        if (e.isConnected !== undefined) {
          return e.isConnected
        }
        while (node.parentNode) {
          node = node.parentNode
        }
        return node.nodeType == 9
      },
      detectLegacy = function (document: Document) {
        var root = document && document.documentElement
        return (
          !!root &&
          (!hasStringIncludes ||
            !root.hasAttribute ||
            !root.getAttributeNames ||
            root.isConnected === undefined ||
            !document.getElementsByClassName ||
            root.firstElementChild === undefined ||
            typeof root.localName != 'string')
        )
      },
      readHelped = {
        tag: function (v: string) {
          return read('hTag', 'tagOf') + '(' + v + ')'
        },
        id: function (v: string) {
          return read('hId', 'idOf') + '(' + v + ')'
        },
        cls: function (v: string) {
          return read('hCls', 'legacyClassOf') + '(' + v + ')'
        },
        up: function (v: string) {
          return read('hUp', 'upOf') + '(' + v + ')'
        },
        next: function (v: string) {
          return read('hNext', 'nextOf') + '(' + v + ')'
        },
        prev: function (v: string) {
          return read('hPrev', 'prevOf') + '(' + v + ')'
        },
        attr: function (v: string, name: string) {
          return read('hAttr', 'attrOf') + '(' + v + ',"' + name + '")'
        },
        has: function (v: string, name: string) {
          return read('hHas', 'hasAttrOf') + '(' + v + ',"' + name + '")'
        },
      },
      helpReads = function (code: string) {
        var reads: Record<string, [string, string]> = {
          localName: ['hTag', 'tagOf'],
          className: ['hCls', 'legacyClassOf'],
          id: ['hId', 'idOf'],
          parentElement: ['hUp', 'upOf'],
          nextElementSibling: ['hNext', 'nextOf'],
          previousElementSibling: ['hPrev', 'prevOf'],
          firstElementChild: ['hFirst', 'firstOf'],
          isConnected: ['hConn', 'connectedOf'],
          hasAttribute: ['hHas', 'hasAttrOf'],
          getAttribute: ['hAttr', 'attrOf'],
        }
        // Match literals before looking inside them. A nested selector may
        // contain text such as "e.localName", which is data, not a host read.
        // This recognizes the string and regexp forms emitted by this compiler.
        return code.replace(
          /("(?:\\[\s\S]|[^"\\])*"|'(?:\\[\s\S]|[^'\\])*'|\/(?:\\[\s\S]|\[(?:\\[\s\S]|[^\]\\])*\]|[^/\\\r\n])+\/[a-z]*)|\b([eno])\.(localName|className|id|parentElement|nextElementSibling|previousElementSibling|firstElementChild|isConnected)\b|\b([eno])\.(hasAttribute|getAttribute)\(("(?:\\[\s\S]|[^"\\])*")\)/g,
          (
            _all: string,
            literal: string,
            node: string,
            prop: string,
            namedNode: string,
            method: string,
            attr: string,
          ) => {
            if (literal) {
              return literal
            }
            var read = reads[prop || method]!
            return (
              helper(read[0], read[1]) +
              '(' +
              (node || namedNode) +
              (attr ? ',' + attr : '') +
              ')'
            )
          },
        )
      },
      H_USED: Record<string, string> = {},
      helper = function (alias: string, name: string) {
        H_USED[alias] = name
        return alias
      },
      read = function (_alias: string, name: string) {
        return 's.' + name
      },
      WeakMapCtor = context.WeakMapCtor,
      elements = function (nodes: ArrayLike<Node>) {
        var output: Element[] = [],
          i = 0
        for (; i < nodes.length; ++i) {
          if (nodes[i]!.nodeType == 1) {
            output[output.length] = nodes[i] as Element
          }
        }
        return output
      },
      byTag = function (tag: string, parent: ParentNode) {
        var host = parent as Document | Element,
          node: Element | null,
          result: Element[] = [],
          descendants: Element[],
          i: number
        if (host.getElementsByTagName) {
          return elements(host.getElementsByTagName(tag))
        }
        tag = tag.toLowerCase()
        node = legacyFirstOf(parent)
        while (node) {
          if (tag == '*' || legacyTagOf(node) == tag) {
            result[result.length] = node
          }
          if (node.getElementsByTagName) {
            descendants = elements(node.getElementsByTagName(tag))
            for (i = 0; i < descendants.length; ++i) {
              result[result.length] = descendants[i]!
            }
          }
          node = legacyNextOf(node)
        }
        return result
      }

    return {
      hasMap: !!context.MapCtor,
      includes: (value, search) => StringPrototypeIndexOf(value, search) !== -1,
      detect: detectLegacy,
      initialize: probeAttributes,
      attrOf: legacyAttrOf,
      hasAttrOf: legacyHasAttrOf,
      tagOf: legacyTagOf,
      idOf: legacyIdOf,
      legacyClassOf: legacyClassOf,
      upOf: legacyUpOf,
      nextOf: legacyNextOf,
      prevOf: legacyPrevOf,
      firstOf: legacyFirstOf,
      attrNamesOf: legacyAttrNamesOf,
      connectedOf: legacyConnectedOf,
      createCache: createLegacyCache,
      createWeakMap: function () {
        return WeakMapCtor ? new WeakMapCtor() : undefined
      },
      byIdRaw: function (id, parent, from) {
        var node: Element | null,
          next = from || legacyFirstOf(parent),
          nodes: Element[] = []
        while ((node = next)) {
          if (legacyIdOf(node) == id) {
            nodes[nodes.length] = node
          }
          if ((next = legacyFirstOf(node) || legacyNextOf(node))) {
            continue
          }
          while (!next && (node = legacyUpOf(node)) && node !== parent) {
            next = legacyNextOf(node)
          }
        }
        return nodes
      },
      byTag: byTag,
      byClass: function (name, parent) {
        var host = parent as Document | Element,
          nodes: ArrayLike<Element>,
          result: Element[] = [],
          i = 0,
          pattern = RegExp(
            '(^|\\s)' + name + '(\\s|$)',
            context.isQuirks() ? 'i' : '',
          )
        if (host.getElementsByClassName) {
          return elements(host.getElementsByClassName(name))
        }
        nodes = context.byTag(
          '*',
          parent as Document | Element | DocumentFragment,
        )
        for (; i < nodes.length; ++i) {
          if (pattern.test(legacyClassOf(nodes[i]!))) {
            result[result.length] = nodes[i]!
          }
        }
        return result
      },
      siblings: function (start, target, local, namespace) {
        var nodes: Element[] = [],
          index = 0,
          node = start
        while (node) {
          if (node === target) {
            index = nodes.length
          }
          if (
            local === undefined ||
            (legacyTagOf(node) == local && node.namespaceURI == namespace)
          ) {
            nodes[nodes.length] = node
          }
          node = legacyNextOf(node)
        }
        return { nodes: nodes, index: index }
      },
      matcher: function (prototype) {
        var host = prototype as
          | (Element &
              Partial<
                Record<
                  | 'webkitMatchesSelector'
                  | 'mozMatchesSelector'
                  | 'msMatchesSelector',
                  Element['matches']
                >
              >)
          | null
          | undefined
        return (
          host &&
          (host.webkitMatchesSelector ||
            host.mozMatchesSelector ||
            host.msMatchesSelector)
        )
      },
      read: readHelped,
      compile: function (source) {
        H_USED = {}
        source = helpReads(source)
        var variables = '',
          alias
        for (alias in H_USED) {
          variables += ',' + alias + '=s.' + H_USED[alias]
        }
        return { source: source, variables: variables }
      },
      installFrames: function (document, create) {
        document.addEventListener(
          'load',
          event => {
            var frame = event.target as HTMLIFrameElement,
              window: (Window & typeof globalThis) | null
            if (
              frame &&
              frame.nodeName.toLowerCase() == 'iframe' &&
              frame.contentDocument &&
              (window = frame.contentWindow as
                | (Window & typeof globalThis)
                | null)
            ) {
              var engine = create(window)
              engine.registerLegacyHooks(createLegacyHooks)
              window.NW || (window.NW = {} as typeof NW)
              window.NW.Dom = engine
              engine.install(true)
            }
          },
          true,
        )
      },
    }
  }
})
