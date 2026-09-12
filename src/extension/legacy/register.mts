/*
 * Optional DOM compatibility hooks for nwsapi.
 * Load after the core and before querying or loading other optional modules.
 */
// Keep this optional module a script for CommonJS, AMD, and browser loading.
type LegacyContext = import('../../core/state/legacy.d.ts').LegacyContext
type LegacyHooks = import('../../core/state/legacy.d.ts').LegacyHooks
type PlanCache<Value> =
  import('../../core/state/legacy.d.ts').LegacyCache<Value>
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
  var legacyAttributes =
    /* @bundle:legacy-attributes */ {} as typeof import('./attributes.mts')
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
      attributeReaders = legacyAttributes.createAttributes(context),
      probeAttributes = attributeReaders.probeAttributes,
      legacyAttrOf = attributeReaders.legacyAttrOf,
      legacyHasAttrOf = attributeReaders.legacyHasAttrOf,
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
        for (var nodesLength = nodes.length; i < nodesLength; ++i) {
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
            for (
              var descendantsLength = descendants.length, i = 0;
              i < descendantsLength;
              ++i
            ) {
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
        for (var nodesLength = nodes.length; i < nodesLength; ++i) {
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
