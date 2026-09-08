/*
 * Copyright (C) 2007-2026 Diego Perini
 * All rights reserved.
 *
 * nwsapi.js - Fast CSS Selectors API Engine
 *
 * Author: Diego Perini <diego.perini at gmail com>
 * Version: 2.3.0-prerelease
 * Created: 20070722
 * Release: 20260830
 *
 * License:
 *  https://javascript.nwbox.com/nwsapi/MIT-LICENSE
 * Download:
 *  https://javascript.nwbox.com/nwsapi/nwsapi.js
 */

;(function Export(global: { NW?: { Dom?: unknown } }, factory) {
  'use strict'

  if (typeof module == 'object' && typeof exports == 'object') {
    module.exports = factory
    Object.defineProperty(module.exports, 'DOMSelector', {
      get: function () {
        return require('./dom-selector.js')
      },
    })
  } else if (typeof define == 'function' && define['amd']) {
    define(factory)
  } else {
    global.NW || (global.NW = {})
    global.NW.Dom = factory(global, Export)
  }
})(this, function Factory(global, Export) {
  var version = 'nwsapi-2.3.0-prerelease',
    doc = global.document,
    root = doc.documentElement,
    slice = Array.prototype.slice,
    // Factory fallback for documents without a window.
    ELEMENT_PROTO = global.Element && global.Element.prototype,
    sliceCall = slice.call.bind(slice),
    HSP = '\\x20\\t',
    VSP = '\\r\\n\\f',
    WSP = '[' + HSP + VSP + ']',
    CFG = {
      // extensions
      operators: '[~*^$|]=|=',
      combinators: '[\\x20\\t>+~](?=[^>+~])',
    },
    NOT = {
      // not enclosed in double/single/parens/square
      double_enc: '(?=(?:[^"]*["][^"]*["])*[^"]*$)',
      single_enc: "(?=(?:[^']*['][^']*['])*[^']*$)",
      parens_enc: '(?![^\\x28]*\\x29)',
      square_enc: '(?![^\\x5b]*\\x5d)',
    },
    REX = {
      // regular expressions
      HasEscapes: /\\/,
      HexNumbers: /^[0-9a-fA-F]/,
      EscOrQuote: /^\\|[\x22\x27]/,
      RegExpChar: /(?!\\)[\\^$.,*+?()[\]{}|\/]/g,
      TrimSpaces: RegExp('^' + WSP + '+|' + WSP + '+$', 'g'),
      SplitGroup: /(\([^)]*\)|\[[^[]*\]|\\.|[^,])+/g,
      CommaGroup: RegExp('(\\s*,\\s*)' + NOT.square_enc + NOT.parens_enc, 'g'),
      FixEscapes: RegExp(
        '\\\\([0-9a-fA-F]{1,6}' + WSP + '?|.)|([\\x22\\x27])',
        'g',
      ),
      CombineWSP: RegExp(
        '[\\n\\r\\f\\x20]+' + NOT.single_enc + NOT.double_enc,
        'g',
      ),
      TabCharWSP: RegExp(
        '(\\x20?\\t+\\x20?)' + NOT.single_enc + NOT.double_enc,
        'g',
      ),
      PseudosWSP: RegExp('\\s+([-+])\\s+' + NOT.square_enc, 'g'),
      LogicalPfx: /^:(is|where|matches|not|has)\x28/i,
    },
    STD = {
      combinator: /\s?([>+~])\s?/g,
      apimethods: /^(?:\w+|\*)\|/,
      namespaces: /(\*|\w+)\|[\w-]+/,
    },
    GROUPS = {
      // pseudo-classes requiring parameters
      linguistic: '(dir|lang)(?:\\x28\\s?([-\\w]{2,})\\s?(?:\\x29|$))',
      logicalsel:
        '(is|where|matches|not|has)(?:\\x28\\s?([^()]*|.*)\\s?(?:\\x29|$))',
      treestruct:
        '(nth(?:-last)?(?:-child|-of\\-type))(?:\\x28\\s?(even|odd|(?:[-+]?\\d*)(?:n\\s?[-+]?\\s?\\d*)?)\\s?(?:\\x29|$))',
      // pseudo-classes not requiring parameters
      locationpc: '(any\\-link|link|visited|target|defined)\\b',
      useraction: '(hover|active|focus\\-within|focus\\-visible|focus)\\b',
      structural:
        '(scope|root|empty|(?:(?:first|last|only)(?:-child|\\-of\\-type)))\\b',
      inputstate:
        '(enabled|disabled|read\\-only|read\\-write|placeholder\\-shown|default|autofill|-webkit\\-autofill)\\b',
      inputvalue:
        '(checked|indeterminate|required|optional|valid|invalid|in\\-range|out\\-of\\-range)\\b',
      // pseudo-classes not requiring parameters and describing functional state
      rsrc_state:
        '(playing|paused|seeking|buffering|stalled|muted|volume\\-locked)\\b',
      disp_state:
        '(open|closed|modal|fullscreen|picture\\-in\\-picture|popover\\-open|popover)\\b',
      time_state: '(current|past|future)\\b',
      // pseudo-elements starting with single colon (:)
      pseudo_sng: '(after|before|first\\-letter|first\\-line)\\b',
      // pseudo-elements starting with double colon (::)
      pseudo_dbl:
        ':(after|before|first\\-letter|first\\-line|selection|placeholder|-webkit-[-a-zA-Z0-9]{2,})\\b',
    },
    Patterns: Record<string, RegExp> = {
      // pseudo-classes
      treestruct: RegExp('^:(?:' + GROUPS.treestruct + ')(.*)', 'i'),
      structural: RegExp('^:(?:' + GROUPS.structural + ')(.*)', 'i'),
      linguistic: RegExp('^:(?:' + GROUPS.linguistic + ')(.*)', 'i'),
      useraction: RegExp('^:(?:' + GROUPS.useraction + ')(.*)', 'i'),
      inputstate: RegExp('^:(?:' + GROUPS.inputstate + ')(.*)', 'i'),
      inputvalue: RegExp('^:(?:' + GROUPS.inputvalue + ')(.*)', 'i'),
      rsrc_state: RegExp('^:(?:' + GROUPS.rsrc_state + ')(.*)', 'i'),
      disp_state: RegExp('^:(?:' + GROUPS.disp_state + ')(.*)', 'i'),
      time_state: RegExp('^:(?:' + GROUPS.time_state + ')(.*)', 'i'),
      locationpc: RegExp('^:(?:' + GROUPS.locationpc + ')(.*)', 'i'),
      logicalsel: RegExp('^:(?:' + GROUPS.logicalsel + ')(.*)', 'i'),
      pseudo_sng: RegExp('^:(?:' + GROUPS.pseudo_sng + ')(.*)', 'i'),
      pseudo_dbl: RegExp('^:(?:' + GROUPS.pseudo_dbl + ')(.*)', 'i'),
      // combinator symbols
      children: RegExp('^' + WSP + '?\\>' + WSP + '?(.*)'),
      adjacent: RegExp('^' + WSP + '?\\+' + WSP + '?(.*)'),
      relative: RegExp('^' + WSP + '?\\~' + WSP + '?(.*)'),
      ancestor: RegExp('^' + WSP + '+(.*)'),
      // universal & namespace
      universal: /^(\*)(.*)/,
      namespace: /^(\*|[\w-]+)?\|(.*)/,
    },
    // regular expression to better aproximate
    // detection of RTL languages (like Arabic)
    RTL =
      /^(?:[\u0627-\u064a]|[\u0591-\u08ff]|[\ufb1d-\ufdfd]|[\ufe70-\ufefc])+$/,
    // elements that can carry a hyperlink, see isLink()
    reLinkName = /^(?:a|area)$/i,
    // emulate firefox error strings
    qsNotArgs = 'Not enough arguments',
    qsInvalid = ' is not a valid selector',
    // detect structural pseudo-classes in selectors
    reNthElem = /(:nth(?:-last)?-child)/i,
    reNthType = /(:nth(?:-last)?-of-type)/i,
    // placeholder for global regexp
    reOptimizer,
    reSimpleId,
    reValidator,
    // special handling configuration flags
    Config = {
      IDS_DUPES: true,
      FORGIVING: true,
      LEGACY: false,
      NODE_LIST: false,
      LOGERRORS: true,
      USR_EVENT: true,
      VERBOSITY: true,
    },
    // Select the allocator once, when the first cache is requested. Legacy
    // hosts probe the constructor; modern hosts use it directly. Capture it
    // so later allocations do not repeat feature detection.
    createWeakMap = function () {
      var Constructor =
        !Config.LEGACY || typeof WeakMap == 'function' ? WeakMap : undefined
      createWeakMap = Constructor
        ? function () {
            return new Constructor()
          }
        : function () {
            return undefined
          }
      return createWeakMap()
    },
    NAMESPACE,
    QUIRKS_MODE,
    HTML_DOCUMENT,
    ATTR_STD_OPS = {
      '=': 1,
      '^=': 1,
      '$=': 1,
      '|=': 1,
      '*=': 1,
      '~=': 1,
    },
    HTML_TABLE = {
      accept: 1,
      'accept-charset': 1,
      align: 1,
      alink: 1,
      axis: 1,
      bgcolor: 1,
      charset: 1,
      checked: 1,
      clear: 1,
      codetype: 1,
      color: 1,
      compact: 1,
      declare: 1,
      defer: 1,
      dir: 1,
      direction: 1,
      disabled: 1,
      enctype: 1,
      face: 1,
      frame: 1,
      hreflang: 1,
      'http-equiv': 1,
      lang: 1,
      language: 1,
      link: 1,
      media: 1,
      method: 1,
      multiple: 1,
      nohref: 1,
      noresize: 1,
      noshade: 1,
      nowrap: 1,
      readonly: 1,
      rel: 1,
      rev: 1,
      rules: 1,
      scope: 1,
      scrolling: 1,
      selected: 1,
      shape: 1,
      target: 1,
      text: 1,
      type: 1,
      valign: 1,
      valuetype: 1,
      vlink: 1,
    },
    Combinators = {},
    Selectors = {},
    Operators = {
      '=': { p1: '^', p2: '$', p3: 'true' },
      '^=': { p1: '^', p2: '', p3: 'true' },
      '$=': { p1: '', p2: '$', p3: 'true' },
      '*=': { p1: '', p2: '', p3: 'true' },
      '|=': { p1: '^', p2: '(-|$)', p3: 'true' },
      '~=': {
        p1: '(^|[\\t\\n\\f\\r ])',
        p2: '([\\t\\n\\f\\r ]|$)',
        p3: 'true',
      },
    },
    concatCall = function (nodes, callback) {
      var i = 0,
        l = nodes.length,
        list = Array(l)
      while (l > i) {
        if (false === callback((list[i] = nodes[i]))) {
          break
        }
        ++i
      }
      return list
    },
    concatList = function (list, nodes) {
      var i = -1,
        l = nodes.length
      while (l--) {
        list[list.length] = nodes[++i]
      }
      return list
    },
    // caching limit for compiled resolver functions
    CACHE_LIMIT = 4096,
    // ES5 bounded LRU cache. It stores query plans (compiled resolvers),
    // never DOM result sets. A prefixed dictionary avoids user-key collisions
    // and a doubly linked list keeps the least-recently-used entry at the head.
    createLegacyCache = function (limit?) {
      var cache = {},
        head = null,
        tail = null,
        size = 0,
        prefix = '\x01',
        has = function (key) {
          return Object.prototype.hasOwnProperty.call(cache, prefix + key)
        },
        unlink = function (entry) {
          entry.prev ? (entry.prev.next = entry.next) : (head = entry.next)
          entry.next ? (entry.next.prev = entry.prev) : (tail = entry.prev)
        },
        link = function (entry) {
          entry.prev = tail
          entry.next = null
          tail ? (tail.next = entry) : (head = entry)
          tail = entry
        },
        promote = function (entry) {
          if (entry !== tail) {
            unlink(entry)
            link(entry)
          }
        },
        remove = function (entry) {
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
        get: function (key) {
          var entry
          if (!has(key)) {
            return undefined
          }
          entry = cache[prefix + key]
          promote(entry)
          return entry.value
        },
        has: function (key) {
          return has(key)
        },
        set: function (key, value) {
          var entry,
            entryKey = prefix + key

          if (has(key)) {
            entry = cache[entryKey]
            entry.value = value
            promote(entry)
          } else {
            size >= limit && remove(head)
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
    // Bounded cache for query plans, in two generations.
    //
    // A strict LRU has to reorder on use and evict one entry per insertion, and
    // both are done with Map.delete. V8 keeps a deleted entry in the backing
    // store until the map rehashes, so keys().next() — the way the oldest entry
    // is found — walks the tombstones left by every earlier eviction. Measured
    // on 8000 selectors cycling through a 4096-entry cache, that put Map.set at
    // 28% of total run time.
    //
    // Instead entries are written to a young generation. When it fills, it
    // becomes the old generation and the previous old one is dropped whole: no
    // deletes, no iteration, and eviction is a single pointer swap. A hit in
    // the old generation carries the entry back into the young one, so anything
    // still in use survives the next swap. Capacity is unchanged, half the
    // limit per generation, and lookups that hit are one Map.get.
    //
    // A value is never undefined, so get() answers existence as well and the
    // cache needs no has().
    createCache = function (limit?) {
      if (typeof Map != 'function') {
        return createLegacyCache(limit)
      }
      var young = new Map(),
        old = new Map(),
        half

      limit || (limit = CACHE_LIMIT)
      half = limit > 1 ? limit >> 1 : 1

      return {
        clear: function () {
          young = new Map()
          old = new Map()
        },
        get: function (key) {
          var value = young.get(key)
          if (value !== undefined) {
            return value
          }
          value = old.get(key)
          if (value !== undefined) {
            // second chance: carry it across before the old generation goes
            old.delete(key)
            if (young.size >= half) {
              old = young
              young = new Map()
            }
            young.set(key, value)
          }
          return value
        },
        set: function (key, value) {
          if (young.size >= half) {
            old = young
            young = new Map()
          }
          young.set(key, value)
          return value
        },
        size: function () {
          return young.size + old.size
        },
      }
    },
    // only define the toNodeList helper if explicitly enabled in Config,
    // a safety measure for headless hosts missing feature/implementation
    toNodeList =
      Config.NODE_LIST == false
        ? function (x) {
            return x
          }
        : (function () {
            // create a DocumentFragment
            var emptyNL = doc.createDocumentFragment().childNodes

            // this is returned from a self-executing function so that
            // the DocumentFragment isn't repeatedly created
            return function (nodeArray) {
              // check if it is already a nodelist
              if (isInstanceOf(nodeArray)) {
                return nodeArray
              }

              // if it's a single element, wrap it in a classic array
              if (!Array.isArray(nodeArray)) {
                nodeArray = [nodeArray]
              }

              // base an object on emptyNL
              var fakeNL = Object.create(emptyNL, {
                length: {
                  value: nodeArray.length,
                  enumerable: false,
                },
                item: {
                  value: function (i) {
                    return this[+i || 0]
                  },
                  enumerable: false,
                },
              })

              // copy the array elemnts
              nodeArray.forEach(function (v, i) {
                fakeNL[i] = v
              })

              // return an object pretending to be a NodeList.
              return fakeNL
            }
          })(),
    isInstanceOf = function (nodes) {
      return nodes instanceof global.NodeList
    },
    documentOrder = function (a, b) {
      if (!hasDupes && a === b) {
        hasDupes = true
        return 0
      }
      return a.compareDocumentPosition(b) & 4 ? -1 : 1
    },
    hasDupes = false,
    unique = function (nodes) {
      var i = 0,
        j = -1,
        l = nodes.length + 1,
        list = []
      while (--l) {
        if (nodes[i++] === nodes[i]) {
          continue
        }
        list[++j] = nodes[i - 1]
      }
      hasDupes = false
      return list
    },
    switchContext = function (context, force?) {
      var oldDoc = doc
      partCounts.clear()
      typeRoutes.clear()
      doc = context.ownerDocument || context
      if (force || oldDoc !== doc) {
        // force a new check for each document change
        // performed before the next select operation
        root = doc.documentElement
        // Compiled case and namespace checks belong to this document.
        matchLambdas.clear()
        selectLambdas.clear()
        matchResolvers.clear()
        selectResolvers.clear()
        if (!Config.LEGACY && detectLegacy(doc)) {
          Config.LEGACY = true
        }
        useLegacy(Config.LEGACY)
        HTML_DOCUMENT = isHTML(doc)
        QUIRKS_MODE = HTML_DOCUMENT && doc.compatMode.indexOf('CSS') < 0
        NAMESPACE = root && root.namespaceURI
        Snapshot.doc = doc
        Snapshot.root = root
        hoverWanted && trackHover()
      }
      return (Snapshot.from = context)
    },
    // convert single codepoint to UTF-16 encoding
    codePointToUTF16 = function (codePoint) {
      // out of range, use replacement character
      if (
        codePoint < 1 ||
        codePoint > 0x10ffff ||
        (codePoint > 0xd7ff && codePoint < 0xe000)
      ) {
        return '\\ufffd'
      }
      // javascript strings are UTF-16 encoded
      if (codePoint < 0x10000) {
        var lowHex = '000' + codePoint.toString(16)
        return '\\u' + lowHex.substr(lowHex.length - 4)
      }
      // supplementary high + low surrogates
      return (
        '\\u' +
        (((codePoint - 0x10000) >> 0x0a) + 0xd800).toString(16) +
        '\\u' +
        (((codePoint - 0x10000) % 0x400) + 0xdc00).toString(16)
      )
    },
    // convert single codepoint to string
    stringFromCodePoint = function (codePoint) {
      // out of range, use replacement character
      if (
        codePoint < 1 ||
        codePoint > 0x10ffff ||
        (codePoint > 0xd7ff && codePoint < 0xe000)
      ) {
        return '\ufffd'
      }
      if (codePoint < 0x10000) {
        return String.fromCharCode(codePoint)
      }
      return String.fromCodePoint
        ? String.fromCodePoint(codePoint)
        : String.fromCharCode(
            ((codePoint - 0x10000) >> 0x0a) + 0xd800,
            ((codePoint - 0x10000) % 0x400) + 0xdc00,
          )
    },
    // convert escape sequence in a CSS string or identifier
    // to javascript string with javascript escape sequences
    escapeIdentifier = function (str) {
      return REX.HasEscapes.test(str)
        ? str.replace(REX.FixEscapes, function (substring, p1, p2) {
            // unescaped " or '
            return p2
              ? '\\' + p2
              : // javascript strings are UTF-16 encoded
                REX.HexNumbers.test(p1)
                ? codePointToUTF16(parseInt(p1, 16))
                : // \' \"
                  REX.EscOrQuote.test(p1)
                  ? substring
                  : // \g \h \. \# etc
                    p1
          })
        : str
    },
    // convert escape sequence in a CSS string or identifier
    // to javascript string with characters representations
    unescapeIdentifier = function (str) {
      return REX.HasEscapes.test(str)
        ? str.replace(REX.FixEscapes, function (substring, p1, p2) {
            // unescaped " or '
            return p2
              ? p2
              : // javascript strings are UTF-16 encoded
                REX.HexNumbers.test(p1)
                ? stringFromCodePoint(parseInt(p1, 16))
                : // \' \"
                  REX.EscOrQuote.test(p1)
                  ? substring
                  : // \g \h \. \# etc
                    p1
          })
        : str
    },
    // split ':is(', ':where(', ':matches(', ':not(' and ':has(' into their
    // selector list argument and the rest of the selector. The argument can
    // nest parentheses and quote them, which a single regular expression
    // cannot track, so the closing parenthesis is located by scanning. An
    // argument left unclosed is closed by EOF, as the CSS Syntax parser does
    // with any open construct. Returns a match-like array so that callers can
    // pop() the remainder the same way they do with a RegExp match.
    splitList = function (text) {
      var chr,
        depth = 0,
        escaped,
        i = 0,
        l = text.length,
        quote = '',
        start = 0,
        list = []

      for (; l > i; ++i) {
        chr = text.charAt(i)
        if (escaped) {
          escaped = false
          continue
        }
        if (chr == '\\') {
          escaped = true
        } else if (quote) {
          if (chr == quote) {
            quote = ''
          }
        } else if (chr == '\x22' || chr == '\x27') {
          quote = chr
        } else if (chr == '\x28' || chr == '\x5b') {
          ++depth
        } else if (chr == '\x29' || chr == '\x5d') {
          --depth
        } else if (chr == ',' && depth === 0) {
          list[list.length] = text.slice(start, i).replace(REX.TrimSpaces, '')
          start = i + 1
        }
      }
      list[list.length] = text.slice(start).replace(REX.TrimSpaces, '')
      return list
    },
    matchLogical = function (selector, prefix?) {
      var chr,
        close,
        escaped,
        depth = 1,
        i,
        l,
        quote = '',
        match = selector.match(prefix || REX.LogicalPfx)

      if (!match) {
        return null
      }

      for (i = match[0].length, l = selector.length; l > i; ++i) {
        chr = selector.charAt(i)
        if (escaped) {
          escaped = false
          continue
        }
        if (chr == '\\') {
          escaped = true
        } else if (quote) {
          if (chr == quote) {
            quote = ''
          }
        } else if (chr == '\x22' || chr == '\x27') {
          quote = chr
        } else if (chr == '\x28') {
          ++depth
        } else if (chr == '\x29' && --depth === 0) {
          break
        }
      }

      // i is the closing parenthesis, or the EOF that stands in for it
      close = l > i ? i + 1 : i

      return [
        selector.slice(0, close),
        match[1],
        selector.slice(match[0].length, i).replace(REX.TrimSpaces, ''),
        selector.slice(close),
      ]
    },
    method = {
      '#': 'getElementById',
      '*': 'getElementsByTagName',
      '|': 'getElementsByTagNameNS',
      '.': 'getElementsByClassName',
    },
    compat = {
      '#': (c, n) => (e, f) => byId(n, c),
      '*': (c, n) => (e, f) => byTag(n, c),
      '|': (c, n) => (e, f) => byTagNS(n, c),
      '.': (c, n) => (e, f) => byClass(n, c),
      '?': (c, n) => (e, f) => byTags(n, c),
    },
    // Fetch a cached plan's candidates without allocating lookup closures.
    fetch = {
      '#': (n, c) => byId(n, c),
      '*': (n, c) => byTag(n, c),
      '|': (n, c) => byTagNS(c, n),
      '.': (n, c) => (/[\t\n\f\r ]/.test(n) ? [] : byClass(n, c)),
      '?': (n, c) => byTags(n, c),
    },
    // find duplicate ids using iterative walk
    // Walk 'context' in tree order collecting elements carrying 'id'. The
    // walk can start at 'from', an element already known to be the first match.
    byIdRaw = function (id, context, from?) {
      var node = context,
        nodes = [],
        next

      if (Config.LEGACY) {
        next = from || firstOf(node)
        while ((node = next)) {
          idOf(node) == id && (nodes[nodes.length] = node)
          if ((next = firstOf(node) || nextOf(node))) {
            continue
          }
          while (!next && (node = upOf(node)) && node !== context) {
            next = nextOf(node)
          }
        }
        return nodes
      }

      next = from || node.firstElementChild
      while ((node = next)) {
        node.id == id && (nodes[nodes.length] = node)
        if ((next = node.firstElementChild || node.nextElementSibling)) {
          continue
        }
        while (!next && (node = node.parentElement) && node !== context) {
          next = node.nextElementSibling
        }
      }
      return nodes
    },
    // context agnostic getElementById
    byId = function (id, context) {
      var e,
        i,
        l,
        nodes,
        ownerDoc,
        api = method['#']

      // duplicates id allowed
      if (Config.IDS_DUPES === false) {
        if (api in context) {
          return (e = context[api](id)) ? [e] : none
        }
      } else {
        if ('all' in context) {
          if ((e = context.all[id])) {
            if (e.nodeType == 1) {
              return attrOf(e, 'id') != id ? [] : [e]
            } else if (id == 'length') {
              return (e = context[api](id)) ? [e] : none
            }
            for (i = 0, l = e.length, nodes = []; l > i; ++i) {
              if (e[i] && e[i].nodeType == 1 && idOf(e[i]) == id) {
                nodes[nodes.length] = e[i]
              }
            }
            return nodes && nodes.length ? nodes : [nodes]
          } else {
            return none
          }
        }
      }

      // Without document.all — jsdom does not implement it — every '#id'
      // used to walk the whole subtree, which measures 2.5ms against 43ns
      // for getElementById on a 6300-element document. getElementById cannot
      // answer on its own, because a document may carry the same id more
      // than once and all of them match, but it does settle two things in
      // constant time: whether the id exists anywhere, and where the first
      // one is, since it returns the first in tree order and any duplicate
      // has to follow it.
      ownerDoc = context.nodeType == 9 ? context : context.ownerDocument

      if (
        ownerDoc &&
        ownerDoc.getElementById &&
        (context.nodeType == 9 || connectedOf(context))
      ) {
        e = ownerDoc.getElementById(id)
        // nothing in the document carries the id, so nothing under context does
        if (!e) {
          return none
        }
        // scoped to an element, the first document-order match may sit
        // outside it, and a match inside it would then be missed
        if (context.nodeType == 9) {
          return byIdRaw(id, context, e)
        }
      }

      return byIdRaw(id, context)
    },
    // wrapped up namespaced TagName api calls
    byTagNS = function (context, tag) {
      return byTag(tag, context)
    },
    // context agnostic getElementsByTagName
    // Narrow logical type lists only when they cover a minority of the tree.
    typeRoutes = createCache(),
    byTags = function (names, context) {
      if (Config.LEGACY || !context.getElementsByTagName) {
        return byTag('*', context)
      }
      var route = typeRoutes.get(names)
      if (route && --route.remaining > 0 && route.broad) {
        return byTag('*', context)
      }
      var probe = !route || route.remaining <= 0,
        tags = names.split(','),
        seen = Object.create(null),
        collections = [],
        count = 0,
        nodes = [],
        list,
        merged,
        left,
        right,
        i,
        tag
      for (i = 0; i < tags.length; ++i) {
        tag = tags[i].trim()
        if (!seen[tag]) {
          seen[tag] = true
          list = context.getElementsByTagName(tag)
          count += list.length
          collections[collections.length] = list
        }
      }
      // Merge comparisons are host calls too. Dense unions are cheaper as
      // one broad pass. Sample live counts periodically; a stale decision
      // only chooses a slower correct route, never supplies cached results.
      if (probe) {
        route = {
          broad:
            count > 0 && count * 3 > context.getElementsByTagName('*').length,
          remaining: 64,
        }
        typeRoutes.set(names, route)
        if (route.broad) {
          return byTag('*', context)
        }
      }
      for (i = 0; i < collections.length; ++i) {
        list = sliceCall(collections[i])
        if (!nodes.length) {
          nodes = list
          continue
        }
        merged = []
        left = right = 0
        // Each lookup is already ordered. Distinct type names are disjoint.
        while (left < nodes.length && right < list.length) {
          merged[merged.length] =
            nodes[left].compareDocumentPosition(list[right]) & 4
              ? nodes[left++]
              : list[right++]
        }
        while (left < nodes.length) {
          merged[merged.length] = nodes[left++]
        }
        while (right < list.length) {
          merged[merged.length] = list[right++]
        }
        nodes = merged
      }
      return nodes
    },
    byTag = function (tag, context) {
      var e,
        nodes,
        api = method['*']
      // DOCUMENT_NODE (9) & ELEMENT_NODE (1)
      if (api in context) {
        nodes = sliceCall(context[api](tag))
        return Config.LEGACY ? elementsOf(nodes) : nodes
      } else if (Config.LEGACY) {
        // DOCUMENT_FRAGMENT_NODE (11) on a host without the element-only
        // traversal, so the children are walked by hand
        tag = tag.toLowerCase()
        nodes = []
        e = firstOf(context)
        while (e) {
          if (tag == '*' || tagOf(e) == tag) {
            nodes[nodes.length] = e
          }
          if (e[api]) {
            concatList(nodes, elementsOf(e[api](tag)))
          }
          e = nextOf(e)
        }
      } else {
        tag = tag.toLowerCase()
        // DOCUMENT_FRAGMENT_NODE (11)
        if ((e = context.firstElementChild)) {
          if (!(e.nextElementSibling || tag == '*' || e.localName == tag)) {
            return sliceCall(e[api](tag))
          } else {
            nodes = []
            do {
              if (tag == '*' || e.localName == tag) {
                nodes[nodes.length] = e
              }
              concatList(nodes, e[api](tag))
            } while ((e = e.nextElementSibling))
          }
        } else {
          nodes = none
        }
      }
      return !Config.NODE_LIST
        ? nodes
        : isInstanceOf(nodes)
          ? nodes
          : toNodeList(nodes)
    },
    // context agnostic getElementsByClassName
    byClass = function (cls, context) {
      var e,
        i,
        l,
        nodes,
        api = method['.'],
        reCls
      // DOCUMENT_NODE (9) & ELEMENT_NODE (1)
      if (api in context) {
        nodes = sliceCall(context[api](cls))
        return Config.LEGACY ? elementsOf(nodes) : nodes
      } else if (Config.LEGACY) {
        // A host from before this lookup existed. Every element under the
        // context is asked for its class instead, which is what the engine
        // would otherwise have the fetch avoid.
        reCls = RegExp('(^|\\s)' + cls + '(\\s|$)', QUIRKS_MODE ? 'i' : '')
        nodes = []
        e = byTag('*', context)
        for (i = 0, l = e.length; l > i; ++i) {
          if (reCls.test(classOf(e[i]))) {
            nodes[nodes.length] = e[i]
          }
        }
      } else {
        // DOCUMENT_FRAGMENT_NODE (11)
        if ((e = context.firstElementChild)) {
          reCls = RegExp('(^|\\s)' + cls + '(\\s|$)', QUIRKS_MODE ? 'i' : '')
          if (!(e.nextElementSibling || reCls.test(e.className))) {
            return sliceCall(e[api](cls))
          } else {
            nodes = []
            do {
              if (reCls.test(e.className)) {
                nodes[nodes.length] = e
              }
              concatList(nodes, e[api](cls))
            } while ((e = e.nextElementSibling))
          }
        } else {
          nodes = none
        }
      }
      return !Config.NODE_LIST
        ? nodes
        : isInstanceOf(nodes)
          ? nodes
          : toNodeList(nodes)
    },
    // namespace aware hasAttribute
    // helper for XML/XHTML documents
    hasAttributeNS = function (e, name) {
      var i,
        l,
        attr = attrNamesOf(e)
      name = RegExp(':?' + name + '$', HTML_DOCUMENT ? 'i' : '')
      for (i = 0, l = attr.length; l > i; ++i) {
        if (name.test(attr[i])) {
          return true
        }
      }
      return false
    },
    elementsOf = function (nodes) {
      var i,
        l,
        out = []
      for (i = 0, l = nodes.length; l > i; ++i) {
        if (nodes[i] && nodes[i].nodeType == 1) {
          out[out.length] = nodes[i]
        }
      }
      return out
    },
    LEGACY_NAMES = {
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
    LEGACY_URLS = {
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
    probeAttributes = function (document) {
      var element, node

      LEGACY_URL_READ = 'flag'
      try {
        element = document.createElement('a')
        element.setAttribute('href', LEGACY_PROBE)
        if (element.getAttribute('href', 2) === LEGACY_PROBE) {
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
    legacyAttrNode = function (e, lower) {
      var attrs = e.attributes,
        node
      if (!attrs) {
        return null
      }
      node = attrs.getNamedItem ? attrs.getNamedItem(lower) : attrs[lower]
      if (!node && LEGACY_NAMES[lower]) {
        node = attrs.getNamedItem
          ? attrs.getNamedItem(LEGACY_NAMES[lower])
          : attrs[LEGACY_NAMES[lower]]
      }
      return node || null
    },
    legacyAttrOf = function (e, name) {
      var lower, node, value

      if (!e || e.nodeType != 1) {
        return null
      }
      lower = name.toLowerCase()
      node = legacyAttrNode(e, lower)

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
              : e.getAttribute(name, 2)
        }
        if (typeof value == 'string') {
          return value
        }
      }

      if (e.getAttribute) {
        value = e.getAttribute(name)
        if (value == null && LEGACY_NAMES[lower]) {
          value = e.getAttribute(LEGACY_NAMES[lower])
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
      return String(value)
    },
    legacyHasAttrOf = function (e, name) {
      if (!e || e.nodeType != 1) {
        return false
      }
      if (e.hasAttribute) {
        return e.hasAttribute(name)
      }
      return legacyAttrOf(e, name) !== null
    },
    legacyTagOf = function (e) {
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
      return HTML_DOCUMENT ? name.toLowerCase() : name
    },
    legacyIdOf = function (e) {
      var value = e && e.id
      if (typeof value == 'string' && legacyTagOf(e) != 'form') {
        return value
      }
      return legacyAttrOf(e, 'id') || ''
    },
    legacyClassOf = function (e) {
      var value = e && e.className
      if (typeof value == 'string') {
        return value
      }
      if (value && typeof value.baseVal == 'string') {
        return value.baseVal
      }
      return legacyAttrOf(e, 'class') || ''
    },
    legacyUpOf = function (e) {
      var node = e.parentElement
      if (node !== undefined) {
        return node
      }
      node = e.parentNode
      return node && node.nodeType == 1 ? node : null
    },
    legacyNextOf = function (e) {
      var node = e.nextElementSibling
      if (node !== undefined) {
        return node
      }
      node = e.nextSibling
      while (node && node.nodeType != 1) {
        node = node.nextSibling
      }
      return node || null
    },
    legacyPrevOf = function (e) {
      var node = e.previousElementSibling
      if (node !== undefined) {
        return node
      }
      node = e.previousSibling
      while (node && node.nodeType != 1) {
        node = node.previousSibling
      }
      return node || null
    },
    legacyFirstOf = function (e) {
      var node = e.firstElementChild
      if (node !== undefined) {
        return node
      }
      node = e.firstChild
      while (node && node.nodeType != 1) {
        node = node.nextSibling
      }
      return node || null
    },
    legacyAttrNamesOf = function (e) {
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
          (attrs[i].specified === undefined || attrs[i].specified)
        ) {
          names[names.length] =
            attrs[i].name !== undefined ? attrs[i].name : attrs[i].nodeName
        }
      }
      return names
    },
    legacyConnectedOf = function (e) {
      var node = e
      if (e.isConnected !== undefined) {
        return e.isConnected
      }
      while (node.parentNode) {
        node = node.parentNode
      }
      return node.nodeType == 9
    },
    attrOf = function (e, name) {
      return e.getAttribute(name)
    },
    hasAttrOf = function (e, name) {
      return e.hasAttribute(name)
    },
    tagOf = function (e) {
      return e.localName
    },
    idOf = function (e) {
      return e.id
    },
    upOf = function (e) {
      return e.parentElement
    },
    nextOf = function (e) {
      return e.nextElementSibling
    },
    prevOf = function (e) {
      return e.previousElementSibling
    },
    firstOf = function (e) {
      return e.firstElementChild
    },
    attrNamesOf = function (e) {
      return e.getAttributeNames()
    },
    connectedOf = function (e) {
      return e.isConnected
    },
    useLegacy = function (on) {
      if (on) {
        probeAttributes(doc)
      }
      attrOf = on
        ? legacyAttrOf
        : function (e, name) {
            return e.getAttribute(name)
          }
      hasAttrOf = on
        ? legacyHasAttrOf
        : function (e, name) {
            return e.hasAttribute(name)
          }
      tagOf = on
        ? legacyTagOf
        : function (e) {
            return e.localName
          }
      idOf = on
        ? legacyIdOf
        : function (e) {
            return e.id
          }
      upOf = on
        ? legacyUpOf
        : function (e) {
            return e.parentElement
          }
      nextOf = on
        ? legacyNextOf
        : function (e) {
            return e.nextElementSibling
          }
      prevOf = on
        ? legacyPrevOf
        : function (e) {
            return e.previousElementSibling
          }
      firstOf = on
        ? legacyFirstOf
        : function (e) {
            return e.firstElementChild
          }
      attrNamesOf = on
        ? legacyAttrNamesOf
        : function (e) {
            return e.getAttributeNames()
          }
      connectedOf = on
        ? legacyConnectedOf
        : function (e) {
            return e.isConnected
          }
    },
    detectLegacy = function (document) {
      var root = document && document.documentElement
      return (
        !!root &&
        (!root.hasAttribute ||
          !document.getElementsByClassName ||
          root.firstElementChild === undefined ||
          typeof root.localName != 'string')
      )
    },
    classOf = function (e) {
      var value = e.className
      if (typeof value == 'string') {
        return value
      }
      // an SVGAnimatedString carries the markup in baseVal, which is cheaper
      // to read than asking for the attribute again
      if (value && typeof value.baseVal == 'string') {
        return value.baseVal
      }
      return attrOf(e, 'class')
    },
    H_USED = {},
    helper = function (alias, name) {
      H_USED[alias] = name
      return alias
    },
    readDirect = {
      tag: function (v) {
        return v + '.localName'
      },
      id: function (v) {
        return v + '.id'
      },
      cls: function (v) {
        return 's.classOf(' + v + ')'
      },
      up: function (v) {
        return v + '.parentElement'
      },
      next: function (v) {
        return v + '.nextElementSibling'
      },
      prev: function (v) {
        return v + '.previousElementSibling'
      },
      attr: function (v, name) {
        return v + '.getAttribute("' + name + '")'
      },
      has: function (v, name) {
        return v + '.hasAttribute("' + name + '")'
      },
    },
    readHelped = {
      tag: function (v) {
        return helper('hTag', 'tagOf') + '(' + v + ')'
      },
      id: function (v) {
        return helper('hId', 'idOf') + '(' + v + ')'
      },
      cls: function (v) {
        return helper('hCls', 'legacyClassOf') + '(' + v + ')'
      },
      up: function (v) {
        return helper('hUp', 'upOf') + '(' + v + ')'
      },
      next: function (v) {
        return helper('hNext', 'nextOf') + '(' + v + ')'
      },
      prev: function (v) {
        return helper('hPrev', 'prevOf') + '(' + v + ')'
      },
      attr: function (v, name) {
        return helper('hAttr', 'attrOf') + '(' + v + ',"' + name + '")'
      },
      has: function (v, name) {
        return helper('hHas', 'hasAttrOf') + '(' + v + ',"' + name + '")'
      },
    },
    helpReads = function (code) {
      var reads = {
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
        function (all, literal, node, prop, namedNode, method, attr) {
          if (literal) {
            return literal
          }
          var read = reads[prop || method]
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
    readGuarded = {
      tag: readDirect.tag,
      id: readDirect.id,
      cls: readDirect.cls,
      up: readDirect.up,
      next: readDirect.next,
      prev: readDirect.prev,
      attr: function (v, name) {
        return v + '.getAttribute&&' + v + '.getAttribute("' + name + '")'
      },
      has: function (v, name) {
        return v + '.hasAttribute&&' + v + '.hasAttribute("' + name + '")'
      },
    },
    // fast resolver for the :nth-child() and :nth-last-child() pseudo-classes
    nthElement = (function () {
      var idx = 0,
        len = 0,
        set = 0,
        parent = undefined,
        parents = Array(),
        nodes = Array()
      return function (element, dir) {
        // ensure caches are emptied after each run, invoking with dir = 2
        if (dir == 2) {
          idx = 0
          len = 0
          set = 0
          nodes.length = 0
          parents.length = 0
          parent = undefined
          return -1
        }
        var e, i, j, k, l
        if (
          parent === (Config.LEGACY ? upOf(element) : element.parentElement)
        ) {
          i = set
          j = idx
          l = len
        } else {
          l = parents.length
          parent = Config.LEGACY ? upOf(element) : element.parentElement
          for (i = -1, j = 0, k = l - 1; l > j; ++j, --k) {
            if (parents[j] === parent) {
              i = j
              break
            }
            if (parents[k] === parent) {
              i = k
              break
            }
          }
          if (i < 0) {
            parents[(i = l)] = parent
            l = 0
            nodes[i] = Array()
            e = parent ? firstOf(parent) || element : element
            if (Config.LEGACY) {
              while (e) {
                nodes[i][l] = e
                if (e === element) {
                  j = l
                }
                e = nextOf(e)
                ++l
              }
            } else {
              while (e) {
                nodes[i][l] = e
                if (e === element) {
                  j = l
                }
                e = e.nextElementSibling
                ++l
              }
            }
            set = i
            idx = 0
            len = l
            if (l < 2) {
              return l
            }
          } else {
            l = nodes[i].length
            set = i
          }
        }
        if (element !== nodes[i][j] && element !== nodes[i][(j = 0)]) {
          for (j = 0, e = nodes[i], k = l - 1; l > j; ++j, --k) {
            if (e[j] === element) {
              break
            }
            if (e[k] === element) {
              j = k
              break
            }
          }
        }
        idx = j + 1
        len = l
        return dir ? l - j : idx
      }
    })(),
    // fast resolver for the :nth-of-type() and :nth-last-of-type() pseudo-classes
    nthOfType = (function () {
      var idx = 0,
        len = 0,
        set = 0,
        parent = undefined,
        parents = Array(),
        nodes = Array()
      return function (element, dir) {
        // ensure caches are emptied after each run, invoking with dir = 2
        if (dir == 2) {
          idx = 0
          len = 0
          set = 0
          nodes.length = 0
          parents.length = 0
          parent = undefined
          return -1
        }
        var e,
          i,
          j,
          k,
          l,
          name = Config.LEGACY ? tagOf(element) : element.localName
        if (
          nodes[set] &&
          nodes[set][name] &&
          parent === (Config.LEGACY ? upOf(element) : element.parentElement)
        ) {
          i = set
          j = idx
          l = len
        } else {
          l = parents.length
          parent = Config.LEGACY ? upOf(element) : element.parentElement
          for (i = -1, j = 0, k = l - 1; l > j; ++j, --k) {
            if (parents[j] === parent) {
              i = j
              break
            }
            if (parents[k] === parent) {
              i = k
              break
            }
          }
          if (i < 0 || !nodes[i][name]) {
            parents[(i = l)] = parent
            nodes[i] || (nodes[i] = Object())
            l = 0
            nodes[i][name] = Array()
            e = parent ? firstOf(parent) || element : element
            if (Config.LEGACY) {
              while (e) {
                if (e === element) {
                  j = l
                }
                if (tagOf(e) == name) {
                  nodes[i][name][l] = e
                  ++l
                }
                e = nextOf(e)
              }
            } else {
              while (e) {
                if (e === element) {
                  j = l
                }
                if (e.localName == name) {
                  nodes[i][name][l] = e
                  ++l
                }
                e = e.nextElementSibling
              }
            }
            set = i
            idx = j
            len = l
            if (l < 2) {
              return l
            }
          } else {
            l = nodes[i][name].length
            set = i
          }
        }
        if (
          element !== nodes[i][name][j] &&
          element !== nodes[i][name][(j = 0)]
        ) {
          for (j = 0, e = nodes[i][name], k = l - 1; l > j; ++j, --k) {
            if (e[j] === element) {
              break
            }
            if (e[k] === element) {
              j = k
              break
            }
          }
        }
        idx = j + 1
        len = l
        return dir ? l - j : idx
      }
    })(),
    // A candidate can only match 'div ul li a' if a div, a ul and a li are
    // all somewhere above it. A prefilter summarizes the tags above an element
    // as bits in one integer before running the full matcher,
    // and an element's summary is its parent's summary plus the parent's own
    // bit, so the walk is paid once per chain rather than once per candidate.
    // Bits collide, which only costs a candidate that would have been
    // rejected, and the summary is a filter — a candidate that survives it is
    // still matched in full.
    ancestorMasks = null,
    // candidates arrive in document order, so consecutive ones usually share a
    // parent: answering from the last one skips the Map entirely
    lastMaskNode = null,
    lastMaskValue = 0,
    tagBits = Object.create(null),
    tagBit = function (name) {
      var i = 0,
        l = name.length,
        h = 0,
        bit = tagBits[name]
      if (bit !== undefined) {
        return bit
      }
      for (; l > i; ++i) {
        h = (h * 31 + name.charCodeAt(i)) | 0
      }
      return (tagBits[name] = 1 << (h & 31))
    },
    ancestorMask = function (node) {
      if (ancestorMasks === null) {
        ancestorMasks = createWeakMap()
      }
      var i,
        mask,
        chain = [],
        parent = node.parentElement

      if (parent === lastMaskNode) {
        return lastMaskValue
      }

      // walk up to the nearest ancestor already summarized, iteratively: a
      // recursive form would be bounded by the stack, not by the document
      while (parent) {
        mask = ancestorMasks.get(parent)
        if (mask !== undefined) {
          break
        }
        chain[chain.length] = parent
        parent = parent.parentElement
      }

      mask = mask === undefined ? 0 : mask | tagBit(parent.localName)

      // then back down, summarizing each ancestor on the way
      for (i = chain.length - 1; i > -1; --i) {
        ancestorMasks.set(chain[i], mask)
        mask |= tagBit(chain[i].localName)
      }

      lastMaskNode = node.parentElement
      lastMaskValue = mask

      return mask
    },
    FILTER_SAMPLE = 64,
    FILTER_KEEP = 48,
    FILTER_RETRY = 4096,
    mayMatch = function (node, mask, state) {
      // switched off for this selector, and counting down to another look:
      // a document can change shape between one query and the next
      if (state.rest > 0) {
        --state.rest
        return true
      }

      var keep = (ancestorMask(node) & mask) === mask

      if (keep) {
        ++state.kept
      }
      if (++state.seen === FILTER_SAMPLE) {
        if (state.kept >= FILTER_KEEP) {
          state.rest = FILTER_RETRY
        }
        state.seen = 0
        state.kept = 0
      }

      return keep
    },
    clearAncestorMasks = function () {
      ancestorMasks = null
      lastMaskNode = null
      lastMaskValue = 0
      return true
    },
    // check if the document type is HTML
    isHTML = function (node) {
      var doc = node.ownerDocument || node
      return doc.nodeType == 9 &&
        // contentType not in IE <= 11
        'contentType' in doc
        ? doc.contentType.indexOf('/html') > 0
        : doc.createElement('DiV').localName == 'div'
    },
    // Native matching exposes custom element state that attributes cannot.
    // https://dom.spec.whatwg.org/#concept-element-defined
    isDefined = function (element) {
      var native,
        custom,
        name = tagOf(element),
        registry,
        view

      if (element.namespaceURI !== 'http://www.w3.org/1999/xhtml') {
        return true
      }
      native = matchesNative(element, ':defined', undefined)
      if (native !== undefined) {
        return native
      }
      if (name.indexOf('-') < 0) {
        if (!hasAttrOf(element, 'is')) {
          return true
        }
        name = attrOf(element, 'is') || name
      }

      view = element.ownerDocument.defaultView
      registry = view && view.customElements
      if (!registry || !registry.get) {
        return false
      }
      custom = registry.get(name)
      return !!custom && element instanceof custom
    },
    isRequired = function (node) {
      return (
        !!node.required &&
        (/^(select|textarea)$/.test(tagOf(node)) ||
          (tagOf(node) == 'input' &&
            !/^(hidden|range|color|button|submit|reset|image)$/.test(
              node.type,
            )))
      )
    },
    isContentEditable = function (node) {
      var attrValue = 'inherit'
      if (hasAttrOf(node, 'contenteditable')) {
        attrValue = attrOf(node, 'contenteditable')
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
            return isContentEditable(node.parentNode)
          }
          return false
      }
    },
    // return node if node is focusable
    // or false if node isn't focusable
    // Whether a form control is disabled, which is not only its own
    // property: a control inside a disabled fieldset is disabled too, unless it
    // sits in that fieldset's first legend child.
    // https://html.spec.whatwg.org/#enabling-and-disabling-form-controls:-the-disabled-attribute
    isDisabled = function (element) {
      var legend,
        name = tagOf(element),
        node

      if (element.disabled === true) {
        return true
      }

      // an optgroup is disabled by its own attribute and nothing else; an
      // option is also disabled by the optgroup it is a child of
      if (name == 'optgroup') {
        return false
      }
      if (name == 'option') {
        node = upOf(element)
        return !!node && tagOf(node) == 'optgroup' && node.disabled === true
      }

      // any disabled fieldset above it, unless it sits in that fieldset's
      // first legend child, which excuses that fieldset and no other
      node = upOf(element)
      while (node) {
        if (node.disabled === true && tagOf(node) == 'fieldset') {
          legend = firstOf(node)
          while (legend && tagOf(legend) != 'legend') {
            legend = nextOf(legend)
          }
          if (!(legend && legend.contains(element))) {
            return true
          }
        }
        node = upOf(node)
      }

      return false
    },
    isFocusable = function (node) {
      var doc = node.ownerDocument
      if (node.contentDocument && tagOf(node) == 'iframe') {
        return false
      }
      if (doc.hasFocus() && node === doc.activeElement) {
        if (node.type || node.href || typeof node.tabIndex == 'number') {
          return node
        }
      }
      return false
    },
    // Called during document setup only when legacy mode needs an alias.
    legacyMatcher = function (proto) {
      return (
        proto &&
        (proto.webkitMatchesSelector ||
          proto.mozMatchesSelector ||
          proto.msMatchesSelector)
      )
    },
    // use the native selector state when it is available; when NWSAPI has
    // installed itself, _matches retains the native implementation
    matchesNative = function (node, selector, unavailable?) {
      var view,
        proto,
        matcher,
        ownerDoc = node.ownerDocument || doc
      if (arguments.length < 3) {
        unavailable = false
      }
      // Record delegation before doing any lookup. Nested calls must not
      // replace the document record belonging to the outer matcher.
      if (matchingNative) {
        matchingNative.delegates = true
        return unavailable
      }
      if (ownerDoc !== matcherDoc) {
        if (matcherCache === null) {
          matcherCache = createWeakMap()
        }
        matcherDoc = ownerDoc
        matcherRecord = matcherCache && matcherCache.get(ownerDoc)
        if (!matcherRecord) {
          matcherRecord = {
            fallback: null,
            matcher: undefined,
            delegates: false,
          }
          if (matcherCache) {
            matcherCache.set(ownerDoc, matcherRecord)
          }
        }
      }
      // Host methods can change after setup, including element overrides.
      // Retain delegation only while the selected function stays the same.
      matcher =
        _matches ||
        ((ownerDoc.defaultView ||
          Object.prototype.hasOwnProperty.call(node, 'matches')) &&
          node.matches) ||
        (ELEMENT_PROTO && ELEMENT_PROTO.matches)
      if (!matcher && Config.LEGACY) {
        if (matcherRecord.fallback === null) {
          view = ownerDoc.defaultView
          proto = view && view.Element && view.Element.prototype
          matcherRecord.fallback =
            legacyMatcher(proto) ||
            (proto !== ELEMENT_PROTO ? legacyMatcher(ELEMENT_PROTO) : undefined)
        }
        matcher = matcherRecord.fallback
      }
      if (matcher !== matcherRecord.matcher) {
        matcherRecord.matcher = matcher
        matcherRecord.delegates = false
      }
      if (!matcher || matcherRecord.delegates) {
        return unavailable
      }
      try {
        matchingNative = matcherRecord
        var result = matcher.call(node, selector)
        return matchingNative.delegates ? unavailable : result
      } catch (e) {
        return unavailable
      } finally {
        matchingNative = null
      }
    },
    // The active record is marked directly on re-entry, even if the host throws.
    matchingNative = null,
    // Consecutive queries avoid a WeakMap lookup. Retain other documents weakly
    // so switching realms does not repeat delegation detection. Allocate after
    // legacy configuration, on first use; undefined selects the bounded fallback.
    matcherDoc = null,
    matcherRecord = null,
    matcherCache = null,
    // :open and :closed have a portable DOM state for details and dialog.
    // Native matching extends support to host-language states such as pickers.
    isOpen = function (node) {
      return (
        (/^(details|dialog)$/i.test(tagOf(node)) && node.open === true) ||
        matchesNative(node, ':open')
      )
    },
    isClosed = function (node) {
      return (
        (/^(details|dialog)$/i.test(tagOf(node)) && node.open === false) ||
        matchesNative(node, ':closed')
      )
    },
    isFullscreen = function (node) {
      var doc = node.ownerDocument
      return (
        matchesNative(node, ':fullscreen') ||
        !!(
          doc &&
          (doc.fullscreenElement === node ||
            doc.webkitFullscreenElement === node ||
            doc.mozFullScreenElement === node ||
            doc.msFullscreenElement === node)
        )
      )
    },
    // A modal dialog cannot be distinguished from dialog.show() without the
    // native :modal state. Fullscreen is explicitly modal per the WPT suite.
    isModal = function (node) {
      return matchesNative(node, ':modal') || isFullscreen(node)
    },
    isPictureInPicture = function (node) {
      var doc = node.ownerDocument
      return (
        matchesNative(node, ':picture-in-picture') ||
        !!(
          doc &&
          (doc.pictureInPictureElement === node ||
            node.webkitPresentationMode === 'picture-in-picture')
        )
      )
    },
    // The popover attribute declares capability, not the showing state. The
    // native pseudo-class is therefore required until an explicit state API is
    // available. :popover is retained as an alias for existing callers.
    isPopoverOpen = function (node) {
      return hasAttrOf(node, 'popover') && matchesNative(node, ':popover-open')
    },
    // ':link', ':any-link' and ':visited' share this test
    isLink = function (node) {
      return reLinkName.test(tagOf(node)) && hasAttrOf(node, 'href')
    },
    // Native state covers host-only timing and volume policy. The fallback
    // reads HTML media state without treating a loading pause as user intent.
    isMediaState = function (media, state) {
      var native = matchesNative(media, ':' + state, undefined)
      if (native !== undefined) {
        return native
      }
      if (
        media.namespaceURI !== 'http://www.w3.org/1999/xhtml' ||
        !/^(audio|video)$/i.test(tagOf(media))
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
            isMediaState(media, 'playing') &&
            media.networkState === 2 &&
            media.readyState < 3
          )
        default:
          return false
      }
    },
    // configure the engine to use special handling
    configure = function (option, clear) {
      if (typeof option == 'string') {
        return !!Config[option]
      }
      if (typeof option != 'object') {
        return Config
      }
      for (var i in option) {
        // Resolvers capture forgiving mode and quiet validation failures.
        if (
          (i == 'FORGIVING' || i == 'VERBOSITY') &&
          Config[i] !== !!option[i]
        ) {
          clear = true
        }
        if (i == 'LEGACY' && Config[i] !== !!option[i]) {
          matcherDoc = matcherCache = null
          clear = true
        }
        Config[i] = !!option[i]
      }
      // clear lambda cache
      if (clear) {
        childPlans.clear()
        typeRoutes.clear()
        descentDeclined.clear()
        matchLambdas.clear()
        selectLambdas.clear()
        matchResolvers.clear()
        selectResolvers.clear()
      }
      useLegacy(Config.LEGACY)
      setIdentifierSyntax()
      return true
    },
    // centralized error and exceptions handling
    errors = 0,
    emit = function (message, proto?) {
      var err
      ++errors
      if (Config.VERBOSITY) {
        if (proto) {
          err = new proto(message)
        } else {
          err = new global.DOMException(message, 'SyntaxError')
        }
        throw err
      }
      if (Config.LOGERRORS && console && console.log) {
        console.log(message)
      }
    },
    // execute the engine initialization code
    initialize = function (doc) {
      setIdentifierSyntax()
      lastContext = switchContext(doc, true)
    },
    // build validation regexps used by the engine
    setIdentifierSyntax = function () {
      //
      // NOTE: SPECIAL CASES IN CSS SYNTAX PARSING RULES
      //
      // The <EOF-token> https://drafts.csswg.org/css-syntax/#typedef-eof-token
      // allow mangled|unclosed selector syntax at the end of selectors strings
      //
      // Literal equivalent hex representations of the characters: " ' ` ] )
      //
      //     \\x22 = " - double quotes    \\x5b = [ - open square bracket
      //     \\x27 = ' - single quote     \\x5d = ] - closed square bracket
      //     \\x60 = ` - back tick        \\x28 = ( - open round parens
      //     \\x5c = \ - back slash       \\x29 = ) - closed round parens
      //
      // using hex format prevents false matches of opened/closed instances
      // pairs, coloring breakage and other editors highlightning problems.
      //

      var parenthesized,
        // non-ascii chars
        noascii = '[^\\x00-\\x9f]',
        // unicode chars
        unicode = '\\\\[0-9a-fA-F]{1,6}',
        // can start with single/double dash
        // but it can not start with a digit
        identifier =
          '(?:-|--|' +
          unicode +
          '[' +
          HSP +
          ']' +
          '?|\\\\[^' +
          VSP +
          ']|' +
          noascii +
          '|[\\w-])+',
        pseudonames = '[-\\w]+',
        pseudoparms = '(?:[-+]?\\d*)(?:n\\s?[-+]?\\s?\\d*)',
        doublequote =
          '"[^"\\\\' + VSP + ']*(?:\\\\.[^"\\\\' + VSP + ']*)*(?:"|$)',
        singlequote =
          "'[^'\\\\" + VSP + "]*(?:\\\\.[^'\\\\" + VSP + "]*)*(?:'|$)",
        attrparser = identifier + '|' + doublequote + '|' + singlequote,
        attrvalues = '([\\x22\\x27]?)((?!\\3)*|(?:\\\\?.)*?)(?:\\3|$)',
        attributes =
          '\\[' +
          // attribute presence
          '(?:\\*\\|)?' +
          WSP +
          '?' +
          '(' +
          identifier +
          '(?::' +
          identifier +
          ')?)' +
          WSP +
          '?' +
          '(?:' +
          '(' +
          CFG.operators +
          ')' +
          WSP +
          '?' +
          '(?:' +
          attrparser +
          ')' +
          ')?' +
          // attribute case sensitivity
          '(?:' +
          WSP +
          '?\\b(i))?' +
          WSP +
          '?' +
          '(?:\\]|$)',
        attrmatcher = attributes.replace(attrparser, attrvalues),
        pseudoclass =
          '(?:\\x28' +
          WSP +
          '*' +
          '(?:' +
          pseudoparms +
          '?)?|' +
          // universal * &
          // namespace *|*
          '(?:\\*|\\*\\|)|' +
          '(?:' +
          '(?::' +
          pseudonames +
          '(?:\\x28' +
          pseudoparms +
          '?(?:\\x29|$))?|' +
          ')|' +
          '(?:[.#]?' +
          identifier +
          ')|' +
          '(?:' +
          attributes +
          ')' +
          ')+|' +
          // the combinator is only recognized, not consumed: taking the
          // character after it swallows the '[' of a following attribute
          // selector, which then cannot be parsed
          '(?:' +
          WSP +
          '?[>+~](?=[^>+~])' +
          WSP +
          '?)|' +
          '(?:' +
          WSP +
          '?,' +
          WSP +
          '?)|' +
          '(?:' +
          WSP +
          '?)|' +
          '(?:\\x29|$)' +
          ')*',
        standardValidator =
          '(?=' +
          WSP +
          '?[^>+~(){}<>])' +
          '(?:' +
          // universal * &
          // namespace *|*
          '(?:\\*|\\*\\|)|' +
          '(?:[.#]?' +
          identifier +
          ')+|' +
          '(?:' +
          attributes +
          ')+|' +
          '(?:::?' +
          pseudonames +
          pseudoclass +
          ')|' +
          '(?:' +
          WSP +
          '?' +
          CFG.combinators +
          WSP +
          '?)|' +
          '(?:' +
          WSP +
          '?,' +
          WSP +
          '?)|' +
          '(?:' +
          WSP +
          '?)' +
          ')+'

      // the following global RE is used to return the
      // deepest localName in selector strings and then
      // use it to retrieve all possible matching nodes
      // that will be filtered by compiled resolvers
      // The parenthesized part has to tolerate nesting. Written as
      // '\x28[^\x29]+' it stops at the first ')', so a final compound
      // holding a nested functional pseudo-class matches nothing at all, and
      // a selector the optimizer cannot read is answered by testing every
      // element in the context instead of the elements of one tag or class.
      parenthesized = '\\x28[^\\x28\\x29]*(?:\\x29|$)'
      parenthesized = '\\x28(?:[^\\x28\\x29]|' + parenthesized + ')*(?:\\x29|$)'
      parenthesized = '\\x28(?:[^\\x28\\x29]|' + parenthesized + ')*(?:\\x29|$)'

      reOptimizer = RegExp(
        '(?:([.:#*]?)' +
          '(' +
          identifier +
          ')' +
          '(?:' +
          ':[-\\w]+|' +
          '\\[[^\\]]+(?:\\]|$)|' +
          parenthesized +
          ')*)$',
      )

      // global
      reValidator = RegExp(standardValidator, 'g')

      // a lone '#id', the shape querySelector is asked for most often
      reSimpleId = RegExp('^#(' + identifier + ')$')

      Patterns.id = RegExp('^#(' + identifier + ')(.*)')
      Patterns.tagName = RegExp('^(' + identifier + ')(.*)')
      Patterns.className = RegExp('^\\.(' + identifier + ')(.*)')
      Patterns.attribute = RegExp('^(?:' + attrmatcher + ')(.*)')
    },
    /*
  //
  // Resolver Compiler Functions
  //
  // Type of operations
  //
  // S - M - N
  //
  // SELECT
  // MATCH
  // NONE
  //
  */

    F_INIT = '"use strict";return function Resolver(c,f,x,r)',
    S_HEAD = 'var e,n,o,j=r.length-1,k=-1,l=c.length',
    M_HEAD = 'var e,n,o',
    N_HEAD = 'var e,n,o,j=r.length-1,k=-1,l=c.length',
    S_LOOP = 'main:while(++k<l&&(e=c[k])!==undefined)',
    M_LOOP = 'e=c;',
    N_LOOP = 'main:while(++k<l&&(e=c.item(k))!==undefined)',
    S_BODY = 'r[++j]=c[k];',
    M_BODY = '',
    N_BODY = 'r[++j]=c.item(k);',
    S_TAIL = 'continue main;',
    M_TAIL = 'r=true;',
    N_TAIL = 'continue main;',
    S_TEST = 'if(f(c[k])){break main;}',
    M_TEST = 'f(c);',
    N_TEST = 'if(f(c.item(k))){break main;}',
    S_VARS = [],
    M_VARS = [],
    N_VARS = [],
    // compile groups or single selector strings into
    // executable functions for matching or selecting
    compile = function (selector, mode, callback, relative?) {
      var cacheKey =
        (relative ? 'relative:' : 'selector:') +
        mode +
        ':' +
        !!callback +
        ':' +
        selector
      var i,
        mask,
        filter,
        ancestry = { required: [], pending: [], walk: false },
        alias,
        factory,
        head = '',
        loop = '',
        macro = '',
        source = '',
        vars = ''
      H_USED = {}

      // 'mode' can be boolean or null
      // true = select / false = match
      // null to use collection.item()
      switch (mode) {
        case true:
          if ((factory = selectLambdas.get(cacheKey)) !== undefined) {
            return factory
          }
          macro = S_BODY + (callback ? S_TEST : '') + S_TAIL
          head = S_HEAD
          loop = S_LOOP
          break
        case false:
          if ((factory = matchLambdas.get(cacheKey)) !== undefined) {
            return factory
          }
          macro = M_BODY + (callback ? M_TEST : '') + M_TAIL
          head = M_HEAD
          loop = M_LOOP
          break
        case null:
          if ((factory = selectLambdas.get(cacheKey)) !== undefined) {
            return factory
          }
          macro = N_BODY + (callback ? N_TEST : '') + N_TAIL
          head = N_HEAD
          loop = N_LOOP
          break
        default:
          break
      }

      source = compileSelector(
        relative && !/^[>+~]/.test(selector) ? ' ' + selector : selector,
        relative ? 'if(e===s.anchor){' + macro + '}' : macro,
        mode,
        callback,
        ancestry,
      )
      if (Config.LEGACY) {
        source = helpReads(source)
      }

      if ((mode || mode === null) && !callback && source === macro) {
        selectLambdas.set(cacheKey, null)
        return null
      }

      // Guard the candidate loop with the ancestor filter. Only for a
      // selection: matching one element has no candidates to reject, and the
      // walk the filter pays for would be the walk it saves. Only when the
      // selector walks ancestors: a chain of child combinators takes one step
      // per combinator whatever the depth, so there is nothing to save and
      // the lookup is a loss. Two required tags or more, so the cheap shapes
      // do not pay a Map lookup to learn what a single comparison tells them.
      // Callbacks can move nodes before later candidates are visited, so they
      // use the full matcher without summaries that could become stale.
      if (
        (mode || mode === null) &&
        ancestry.walk &&
        ancestry.required.length > 1 &&
        !callback &&
        !Config.LEGACY
      ) {
        for (i = 0, mask = 0; ancestry.required.length > i; ++i) {
          mask |= tagBit(ancestry.required[i])
        }
        filter = { seen: 0, kept: 0, rest: 0 }
        source = 'if(s.mayMatch(e,' + mask + ',a)){' + source + '}'
      }

      loop += mode || mode === null ? '{' + source + '}' : source

      // Drop the summaries with the call that built them. They key on
      // elements, so holding them past the call would keep a removed subtree
      // alive, and an element that moves in the meantime would carry a
      // summary describing where it used to be.
      if (mask) {
        loop = 'try{' + loop + '}finally{s.clearAncestorMasks();}'
      }

      if (mode || selector.includes(':nth')) {
        loop += reNthElem.test(selector) ? 's.nthElement(null, 2);' : ''
        loop += reNthType.test(selector) ? 's.nthOfType(null, 2);' : ''
      }

      if (S_VARS[0] || M_VARS[0] || N_VARS[0]) {
        vars = ',' + (S_VARS.join(',') || M_VARS.join(',') || N_VARS[0])
        S_VARS.length = 0
        M_VARS.length = 0
        N_VARS.length = 0
      }

      for (alias in H_USED) {
        vars += ',' + alias + '=s.' + H_USED[alias]
      }

      // oxlint-disable-next-line typescript/no-implied-eval -- Selectors compile to resolver functions.
      factory = Function(
        's',
        'a',
        F_INIT + '{' + head + vars + ';' + loop + 'return r;}',
      )(Snapshot, filter)

      if (mode || mode === null) {
        selectLambdas.set(cacheKey, factory)
      } else {
        matchLambdas.set(cacheKey, factory)
      }

      return factory
    },
    // build conditional code to check components of selector strings
    isCompound = function (text) {
      var chr,
        depth = 0,
        escaped,
        i = 0,
        l = text.length,
        quote = ''

      for (; l > i; ++i) {
        chr = text.charAt(i)
        if (escaped) {
          escaped = false
          continue
        }
        if (chr == '\\') {
          escaped = true
        } else if (quote) {
          if (chr == quote) {
            quote = ''
          }
        } else if (chr == '\x22' || chr == '\x27') {
          quote = chr
        } else if (chr == '\x28' || chr == '\x5b') {
          ++depth
        } else if (chr == '\x29' || chr == '\x5d') {
          --depth
        } else if (
          depth === 0 &&
          (chr == ',' ||
            chr == '>' ||
            chr == '+' ||
            chr == '~' ||
            chr == ' ' ||
            chr == '\t' ||
            chr == '\n' ||
            chr == '\f' ||
            chr == '\r')
        ) {
          return false
        }
      }

      return l > 0
    },
    // Compile deferred arguments before any candidate can short-circuit them.
    // Keep validation's helper aliases and extension variables out of the
    // surrounding resolver. Forgiving lists still validate each item inside
    // matchForgiving(), where an invalid item can be discarded independently.
    validateLogical = function (argument, relative) {
      var previousErrors = errors,
        aliases = H_USED,
        selectVars = S_VARS,
        matchVars = M_VARS,
        nodeVars = N_VARS,
        list = splitList(argument),
        parsed,
        i,
        j
      H_USED = {}
      S_VARS = []
      M_VARS = []
      N_VARS = []
      try {
        for (i = 0; i < list.length; ++i) {
          if (!list[i]) {
            emit(qsInvalid)
            return false
          }
          parsed = parse(relative ? '* ' + list[i] : list[i], false)
          if (!parsed) {
            return false
          }
          for (j = 0; j < parsed.length; ++j) {
            compileSelector(parsed[j], '', relative, false)
          }
        }
        return errors == previousErrors
      } finally {
        H_USED = aliases
        S_VARS = selectVars
        M_VARS = matchVars
        N_VARS = nodeVars
      }
    },
    notFlag = 0,
    compileSelector = function (expression, source, mode, callback, ancestry?) {
      var a,
        b,
        n,
        f,
        k = 0,
        previousErrors = errors,
        compat,
        name,
        NS,
        expr,
        value,
        match,
        pendingTag = '',
        result,
        status,
        symbol,
        test,
        type,
        selector = expression,
        vars,
        argument,
        flag,
        nested,
        read

      read = Config.LEGACY
        ? readHelped
        : mode === false
          ? readGuarded
          : readDirect

      // Each compilation owns its requirements. Validation and nested :not()
      // compilation must not contribute tags to the surrounding resolver.
      ancestry = ancestry || { required: [], pending: [], walk: false }

      // isolate selector combinators
      selector = selector.replace(STD.combinator, '$1')

      // javascript needs a label to break
      // out of the while loops processing
      selector_recursion_label: while (selector) {
        ++k

        // get namespace prefix if present or get first char of selector
        symbol = STD.apimethods.test(selector) ? '|' : selector[0]

        switch (symbol) {
          // universal resolver
          case '*':
            match = selector.match(Patterns.universal)
            break

          // id resolver
          case '#':
            match = selector.match(Patterns.id)
            // an exact comparison, which is what the selector asks for.
            // escapeIdentifier turns the CSS escapes into JavaScript ones, so
            // only the quote is escaped after it.
            expr = escapeIdentifier(match[1]).replace(
              /\\.|\x22/g,
              function (part) {
                return part == '"' ? '\\"' : part
              },
            )
            source =
              'if((' + read.id('e') + '=="' + expr + '")){' + source + '}'
            break

          // class name resolver
          case '.':
            match = selector.match(Patterns.className)
            match[1] = /[\t\n\f\r ]/.test(unescapeIdentifier(match[1]))
              ? '(?!)'
              : escapeIdentifier(match[1]).replace(REX.RegExpChar, '\\$&')
            compat = (QUIRKS_MODE ? 'i' : '') + '.test(' + read.cls('e') + ')'
            source =
              'if((/(^|\\s)' +
              match[1] +
              '(\\s|$)/' +
              compat +
              ')){' +
              source +
              '}'
            break

          // tag name resolver
          case /[_a-z]/i.test(symbol) ? symbol : undefined:
            match = selector.match(Patterns.tagName)
            // the same string the comparison uses, so a filter built from it
            // cannot reject anything this test would have accepted
            ancestry.pending[ancestry.pending.length] = match[1]
            pendingTag = 'if((' + read.tag('e') + '=="' + match[1] + '")){'
            break

          // namespace resolver
          case '|':
            match = selector.match(Patterns.namespace)
            if (match[1] == '*') {
              source = 'if(true){' + source + '}'
            } else if (!match[1]) {
              source = 'if((!e.namespaceURI)){' + source + '}'
            } else if (typeof match[1] == 'string' && root.prefix == match[1]) {
              source =
                'if((e.namespaceURI=="' + NAMESPACE + '")){' + source + '}'
            } else {
              emit("'" + expression + "'" + qsInvalid)
            }
            break

          // attributes resolver
          case '[':
            match = selector.match(Patterns.attribute)
            if (!match) {
              break
            }
            NS = match[0].match(STD.namespaces)
            name = match[1]
            expr = name.split(':')
            expr = expr.length == 2 ? expr[1] : expr[0]
            if (match[2] && !(test = Operators[match[2]])) {
              emit("'" + expression + "'" + qsInvalid)
              return ''
            }
            if (match[4] === '') {
              test =
                match[2] == '~='
                  ? { p1: '(?!)', p2: '', p3: 'true' }
                  : match[2] in ATTR_STD_OPS && match[2] != '~='
                    ? { p1: '^', p2: '$', p3: 'true' }
                    : test
            } else if (
              match[2] == '~=' &&
              /[\t\n\f\r ]/.test(unescapeIdentifier(match[4]))
            ) {
              // A token cannot contain CSS whitespace. Decode first: the
              // space terminating a hexadecimal escape is not part of it.
              source = 'if(false){' + source + '}'
              break
            } else if (match[4]) {
              value = escapeIdentifier(match[4])
              match[4] = value.replace(REX.RegExpChar, '\\$&')
              value = value.replace(/\\.|\x22/g, function (part) {
                return part == '"' ? '\\"' : part
              })
            }
            type =
              match[5] == 'i' ||
              (HTML_DOCUMENT && HTML_TABLE[expr.toLowerCase()])
                ? 'i'
                : ''
            source =
              'if((' +
              (!match[2]
                ? NS
                  ? 's.hasAttributeNS(e,"' + name + '")'
                  : read.has('e', name)
                : !match[4] && ATTR_STD_OPS[match[2]] && match[2] != '~='
                  ? read.attr('e', name) + '==""'
                  : match[2] == '=' && type == '' && test.p3 == 'true'
                    ? read.attr('e', name) + '=="' + value + '"'
                    : '(/' +
                      test.p1 +
                      match[4] +
                      test.p2 +
                      '/' +
                      type +
                      ').test(' +
                      (match[2] == '~=' && test.p3 == 'true'
                        ? '(' + read.attr('e', name) + '||"")'
                        : read.attr('e', name)) +
                      ')==' +
                      test.p3) +
              ')){' +
              source +
              '}'
            break

          // *** General sibling combinator
          // E ~ F (F relative sibling of E)
          case '~':
            match = selector.match(Patterns.relative)
            ancestry.pending.length = 0
            if (pendingTag) {
              source = pendingTag + source + '}'
              pendingTag = ''
            }
            source =
              'var N' +
              k +
              '=e;while(e&&(e=' +
              read.prev('e') +
              ')){' +
              source +
              '}e=N' +
              k +
              ';'
            break

          // *** Adjacent sibling combinator
          // E + F (F adiacent sibling of E)
          case '+':
            match = selector.match(Patterns.adjacent)
            ancestry.pending.length = 0
            if (pendingTag) {
              source = pendingTag + source + '}'
              pendingTag = ''
            }
            source =
              'var N' +
              k +
              '=e;if(e&&(e=' +
              read.prev('e') +
              ')){' +
              source +
              '}e=N' +
              k +
              ';'
            break

          // *** Descendant combinator
          // E F (E ancestor of F)
          case '\x09':
          case '\x20':
            match = selector.match(Patterns.ancestor)
            // Pending tags now have to appear above the candidate. Sibling
            // combinators discard their own pending tags but retain earlier
            // ancestor requirements, since siblings share those ancestors.
            ancestry.required.push.apply(ancestry.required, ancestry.pending)
            ancestry.pending.length = 0
            ancestry.walk = true
            if (pendingTag) {
              source = pendingTag + source + '}'
              pendingTag = ''
            }
            source =
              'var N' +
              k +
              '=e;while(e&&(e=' +
              read.up('e') +
              ')){' +
              source +
              '}e=N' +
              k +
              ';'
            break

          // *** Child combinator
          // E > F (F children of E)
          case '>':
            match = selector.match(Patterns.children)
            ancestry.required.push.apply(ancestry.required, ancestry.pending)
            ancestry.pending.length = 0
            if (pendingTag) {
              source = pendingTag + source + '}'
              pendingTag = ''
            }
            source =
              'var N' +
              k +
              '=e;if(e&&(e=' +
              read.up('e') +
              ')){' +
              source +
              '}e=N' +
              k +
              ';'
            break

          // *** user supplied combinators extensions
          case symbol in Combinators ? symbol : undefined:
            // for other registered combinators extensions
            match[match.length - 1] = '*'
            source = Combinators[symbol](match) + source
            break

          // *** tree-structural pseudo-classes
          // :root, :empty, :first-child, :last-child, :only-child, :first-of-type, :last-of-type, :only-of-type
          case ':':
            if ((match = selector.match(Patterns.structural))) {
              match[1] = match[1].toLowerCase()
              switch (match[1]) {
                case 'scope':
                  // use the root (documentElement) when comparing against a document
                  source =
                    'if(e===(s.from.nodeType===9?s.root:s.from)){' +
                    source +
                    '}'
                  break
                case 'root':
                  // there can only be one :root element, so exit the loop once found
                  source =
                    'if((e===s.root)){' +
                    source +
                    (mode ? 'break main;' : '') +
                    '}'
                  break
                case 'empty':
                  // matches elements that don't contain elements or text nodes
                  source =
                    'n=e.firstChild;while(n&&!(/1|3/).test(n.nodeType)){n=n.nextSibling}if(!n){' +
                    source +
                    '}'
                  break

                // *** child-indexed pseudo-classes
                // :first-child, :last-child, :only-child
                case 'only-child':
                  source =
                    'if((!e.nextElementSibling&&!e.previousElementSibling)){' +
                    source +
                    '}'
                  break
                case 'last-child':
                  source = 'if((!e.nextElementSibling)){' + source + '}'
                  break
                case 'first-child':
                  source = 'if((!e.previousElementSibling)){' + source + '}'
                  break

                // *** typed child-indexed pseudo-classes
                // :only-of-type, :last-of-type, :first-of-type
                case 'only-of-type':
                  source =
                    'o=e.localName;' +
                    'n=e;while((n=n.nextElementSibling)&&n.localName!=o);if(!n){' +
                    'n=e;while((n=n.previousElementSibling)&&n.localName!=o);}if(!n){' +
                    source +
                    '}'
                  break
                case 'last-of-type':
                  source =
                    'n=e;o=e.localName;while((n=n.nextElementSibling)&&n.localName!=o);if(!n){' +
                    source +
                    '}'
                  break
                case 'first-of-type':
                  source =
                    'n=e;o=e.localName;while((n=n.previousElementSibling)&&n.localName!=o);if(!n){' +
                    source +
                    '}'
                  break
                default:
                  emit("'" + expression + "'" + qsInvalid)
                  break
              }
            }

            // *** child-indexed & typed child-indexed pseudo-classes
            // :nth-child, :nth-of-type, :nth-last-child, :nth-last-of-type
            else if ((match = selector.match(Patterns.treestruct))) {
              match[1] = match[1].toLowerCase()
              switch (match[1]) {
                case 'nth-child':
                case 'nth-of-type':
                case 'nth-last-child':
                case 'nth-last-of-type':
                  expr = /-of-type/i.test(match[1])
                  if (match[1] && match[2]) {
                    type = /last/i.test(match[1])
                    if (match[2] == 'n') {
                      source = 'if(true){' + source + '}'
                      break
                    } else if (match[2] == '1') {
                      test = type ? 'next' : 'previous'
                      source = expr
                        ? 'n=e;o=e.localName;' +
                          'while((n=n.' +
                          test +
                          'ElementSibling)&&n.localName!=o);if(!n){' +
                          source +
                          '}'
                        : 'if(!e.' + test + 'ElementSibling){' + source + '}'
                      break
                    } else if (
                      match[2] == 'even' ||
                      match[2] == '2n0' ||
                      match[2] == '2n+0' ||
                      match[2] == '2n'
                    ) {
                      test = 'n%2==0'
                    } else if (
                      match[2] == 'odd' ||
                      match[2] == '2n1' ||
                      match[2] == '2n+1'
                    ) {
                      test = 'n%2==1'
                    } else {
                      f = /n/i.test(match[2])
                      n = match[2].split('n')
                      a = parseInt(n[0], 10) || 0
                      b = parseInt(n[1], 10) || 0
                      if (n[0] == '-') {
                        a = -1
                      }
                      if (n[0] == '+') {
                        a = +1
                      }
                      test =
                        (b
                          ? '(n' + (b > 0 ? '-' : '+') + Math.abs(b) + ')'
                          : 'n') +
                        '%' +
                        a +
                        '==0'
                      test =
                        a >= +1
                          ? f
                            ? 'n>' +
                              (b - 1) +
                              (Math.abs(a) != 1 ? '&&' + test : '')
                            : 'n==' + a
                          : a <= -1
                            ? f
                              ? 'n<' +
                                (b + 1) +
                                (Math.abs(a) != 1 ? '&&' + test : '')
                              : 'n==' + a
                            : a === 0
                              ? n[0]
                                ? 'n==' + b
                                : 'n>' + (b - 1)
                              : 'false'
                    }
                    // A constant index needs no index. nth(Element|OfType)
                    // builds the sibling list of the parent to number the
                    // element within it, which is the right trade for an an+b
                    // form that has to know where the element sits, and pure
                    // overhead for ':nth-child(3)', which only has to know
                    // whether three steps back runs out of siblings.
                    //
                    // Only for the -child forms: of-type has to compare the
                    // name of every sibling it steps over, and reading
                    // localName through the host on each one costs more than
                    // the list it avoids.
                    if (test == 'n==' + a && a >= 1 && !expr) {
                      if (mode === true && !callback && !Config.LEGACY) {
                        // Dense selections usually visit siblings together.
                        // Find this parent's one qualifying child once, then
                        // compare identities. Locals live for this invocation
                        // only, so mutations and reentrant calls cannot reuse
                        // an earlier query's position.
                        flag = '_p' + notFlag++
                        S_VARS.push(flag, flag + 'v')
                        source =
                          'o=e.parentNode;if(o&&(o===' +
                          flag +
                          '||(k+1<l&&c[k+1].parentNode===o))){if(o!==' +
                          flag +
                          '){' +
                          flag +
                          '=o;' +
                          flag +
                          'v=o?o.' +
                          (type ? 'last' : 'first') +
                          'ElementChild:null;' +
                          'n=1;while(n<' +
                          a +
                          '&&' +
                          flag +
                          'v){' +
                          flag +
                          'v=' +
                          flag +
                          'v.' +
                          (type ? 'previous' : 'next') +
                          'ElementSibling;++n;}}n=e===' +
                          flag +
                          'v;}else{n=1,o=e;while(n<=' +
                          a +
                          '&&(o=o.' +
                          (type ? 'next' : 'previous') +
                          'ElementSibling))++n;n=n==' +
                          a +
                          ';}if(n){' +
                          source +
                          '}'
                        break
                      }
                      test = type ? 'next' : 'previous'
                      source =
                        'n=1,o=e;' +
                        'while(n<=' +
                        a +
                        '&&(o=o.' +
                        test +
                        'ElementSibling))++n;' +
                        'if(n==' +
                        a +
                        '){' +
                        source +
                        '}'
                      break
                    }
                    expr = expr ? 'OfType' : 'Element'
                    type = type ? 'true' : 'false'
                    source =
                      'n=s.nth' +
                      expr +
                      '(e,' +
                      type +
                      ');if((' +
                      test +
                      ')){' +
                      source +
                      '}'
                  } else {
                    emit("'" + expression + "'" + qsInvalid)
                  }
                  break
                default:
                  emit("'" + expression + "'" + qsInvalid)
                  break
              }
            }

            // *** logical combination pseudo-classes
            // :is( s1, [ s2, ... ]), :not( s1, [ s2, ... ]),
            // :has( s1, [ s2, ... ]) no nesting is allowed for
            // :where( s1, [ s2, ... ]), :matches( s1, [ s2, ... ]),
            else if ((match = matchLogical(selector))) {
              match[1] = match[1].toLowerCase()
              expr = match[2].replace(/\x22/g, '\\"')
              switch (match[1]) {
                case 'is':
                case 'where':
                  if (
                    /^(?:[a-z][a-z0-9-]*)?(?:[.#][_a-zA-Z][-\w]*)+$/.test(
                      match[2],
                    )
                  ) {
                    // A simple compound cannot move e or contain an invalid
                    // forgiving-list item. Emit its predicate once instead
                    // of re-entering match() for every candidate.
                    flag = '_n' + notFlag++
                    nested = compileSelector(
                      match[2],
                      flag + '=true;',
                      mode,
                      callback,
                    )
                    source =
                      'var ' +
                      flag +
                      '=false;' +
                      nested +
                      'if(' +
                      flag +
                      '){' +
                      source +
                      '}'
                  } else if (
                    /^[a-z][a-z0-9-]*(?:[\t\n\f\r ]*,[\t\n\f\r ]*[a-z][a-z0-9-]*)*$/.test(
                      match[2],
                    )
                  ) {
                    source =
                      'if(' +
                      splitList(match[2])
                        .map(function (tag) {
                          return read.tag('e') + '=="' + tag + '"'
                        })
                        .join('||') +
                      '){' +
                      source +
                      '}'
                  } else if (Config.FORGIVING) {
                    source =
                      'if(s.matchForgiving(' +
                      JSON.stringify(splitList(match[2])) +
                      ',e)){' +
                      source +
                      '}'
                  } else {
                    if (!validateLogical(match[2], false)) {
                      return ''
                    }
                    source = 'if(s.match("' + expr + '",e)){' + source + '}'
                  }
                  break
                case 'matches':
                  if (!validateLogical(match[2], false)) {
                    return ''
                  }
                  source = 'if(s.match("' + expr + '",e)){' + source + '}'
                  break
                case 'not':
                  if (isCompound((argument = match[2]))) {
                    flag = '_n' + notFlag++
                    nested = compileSelector(
                      argument,
                      flag + '=true;',
                      mode,
                      callback,
                    )
                    source =
                      'var ' +
                      flag +
                      '=false;' +
                      nested +
                      'if(!' +
                      flag +
                      '){' +
                      source +
                      '}'
                  } else {
                    if (!validateLogical(match[2], false)) {
                      return ''
                    }
                    source = 'if(!s.match("' + expr + '",e)){' + source + '}'
                  }
                  break
                case 'has':
                  if (!validateLogical(match[2], true)) {
                    return ''
                  }
                  argument = /^>[\t\n\f\r ]*([a-z][a-z0-9-]*|\*)$/.exec(
                    match[2],
                  )
                  if (argument) {
                    source =
                      'if(s.hasChild(e,"' + argument[1] + '")){' + source + '}'
                    break
                  }
                  source =
                    'if(s.has(' +
                    JSON.stringify(splitList(match[2])) +
                    ',e)){' +
                    source +
                    '}'
                  break
                default:
                  emit("'" + expression + "'" + qsInvalid)
                  break
              }
            }

            // *** linguistic pseudo-classes
            // :dir( ltr / rtl ), :lang( en )
            else if ((match = selector.match(Patterns.linguistic))) {
              match[1] = match[1].toLowerCase()
              switch (match[1]) {
                case 'dir':
                  source =
                    'var p;if((' +
                    '(/' +
                    match[2] +
                    '/i.test(e.dir))||(p=s.ancestor("[dir]", e))&&' +
                    '(/' +
                    match[2] +
                    '/i.test(p.dir))||(e.dir==""||e.dir=="auto")&&' +
                    '(' +
                    (match[2] == 'ltr' ? '!' : '') +
                    RTL +
                    '.test(e.textContent)))' +
                    '){' +
                    source +
                    '};'
                  break
                case 'lang':
                  expr = '(?:^|-)' + match[2] + '(?:-|$)'
                  source =
                    'var p;if((' +
                    '(e.isConnected&&(e.lang==""&&(p=s.ancestor("[lang]",e)))&&' +
                    '(p.lang=="' +
                    match[2] +
                    '")||/' +
                    expr +
                    '/i.test(e.lang)))' +
                    '){' +
                    source +
                    '};'
                  break
                default:
                  emit("'" + expression + "'" + qsInvalid)
                  break
              }
            }

            // *** location pseudo-classes
            // :any-link, :link, :visited, :target, :defined
            else if ((match = selector.match(Patterns.locationpc))) {
              match[1] = match[1].toLowerCase()
              switch (match[1]) {
                case 'any-link':
                  source = 'if((s.isLink(e)||e.visited)){' + source + '}'
                  break
                case 'link':
                  source = 'if(s.isLink(e)){' + source + '}'
                  break
                case 'visited':
                  source = 'if((s.isLink(e)&&e.visited)){' + source + '}'
                  break
                case 'target':
                  source =
                    'if(((s.doc.compareDocumentPosition(e)&16)&&s.doc.location.hash&&e.id==s.doc.location.hash.slice(1))){' +
                    source +
                    '}'
                  break
                case 'defined':
                  source = 'if(s.isDefined(e)){' + source + '}'
                  break
                default:
                  emit("'" + expression + "'" + qsInvalid)
                  break
              }
            }

            // *** user actions pseudo-classes
            // :hover, :active, :focus, :focus-visible, :focus-within
            else if ((match = selector.match(Patterns.useraction))) {
              match[1] = match[1].toLowerCase()
              switch (match[1]) {
                case 'hover':
                  trackHover()
                  source =
                    'if(e===s.HOVER||s.matchesNative(e,":hover")){' +
                    source +
                    '}'
                  break
                case 'active':
                  source = 'if(e===s.doc.activeElement){' + source + '}'
                  break
                case 'focus':
                  source = 'if(s.isFocusable(e)){' + source + '}'
                  break
                case 'focus-visible':
                  // The v2.x branch has no reliable keyboard-modality state.
                  // An element with observable input focus is the conservative
                  // behavior shared by focus and focus-visible in this line.
                  source = 'if(s.isFocusable(e)){' + source + '}'
                  break
                case 'focus-within':
                  source = 'if(e.contains(s.doc.activeElement)){' + source + '}'
                  break
                default:
                  emit("'" + expression + "'" + qsInvalid)
                  break
              }
            }

            // *** user interface and form pseudo-classes
            // :enabled, :disabled, :read-only, :read-write, :placeholder-shown, :default
            else if ((match = selector.match(Patterns.inputstate))) {
              match[1] = match[1].toLowerCase()
              switch (match[1]) {
                case 'enabled':
                  // the complement of ':disabled' over the same elements
                  source =
                    'if((("form" in e||/^optgroup$/i.test(e.localName))&&' +
                    '"disabled" in e&&!s.isDisabled(e))){' +
                    source +
                    '}'
                  break
                case 'disabled':
                  source =
                    'if((("form" in e||/^optgroup$/i.test(e.localName))&&' +
                    '"disabled" in e&&s.isDisabled(e))){' +
                    source +
                    '}'
                  break
                case 'read-only':
                case '-moz-read-only':
                  source =
                    'if(' +
                    '(/^textarea$/i.test(e.localName)&&(e.readOnly||s.isDisabled(e)))||' +
                    '(/^input$/i.test(e.localName)&&("|date|datetime-local|email|month|number|password|search|tel|text|time|url|week|".includes("|"+e.type+"|")?(e.readOnly||s.isDisabled(e)):true))||' +
                    '(!/^(?:input|textarea)$/i.test(e.localName) && !s.isContentEditable(e))' +
                    '){' +
                    source +
                    '}'
                  break
                case 'read-write':
                case '-moz-read-write':
                  source =
                    'if(' +
                    '(/^textarea$/i.test(e.localName)&&!e.readOnly&&!s.isDisabled(e))||' +
                    '(/^input$/i.test(e.localName)&&"|date|datetime-local|email|month|number|password|search|tel|text|time|url|week|".includes("|"+e.type+"|")&&!e.readOnly&&!s.isDisabled(e))||' +
                    '(!/^(?:input|textarea)$/i.test(e.localName) && s.isContentEditable(e))' +
                    '){' +
                    source +
                    '}'
                  break
                case 'autofill':
                case '-webkit-autofill':
                  source =
                    'if(s.matchesNative(e,":autofill")||s.matchesNative(e,":-webkit-autofill")){' +
                    source +
                    '}'
                  break
                case 'placeholder-shown':
                  source =
                    'if((' +
                    '(/^(?:input|textarea)$/i.test(e.localName))&&e.hasAttribute("placeholder")&&' +
                    '("|textarea|password|number|search|email|text|tel|url|".includes("|"+e.type+"|"))&&' +
                    '(!s.match(":focus",e))' +
                    ')){' +
                    source +
                    '}'
                  break
                case 'default':
                  source =
                    'if(("form" in e && e.form)){' +
                    'var x=0;n=[];' +
                    'if(e.type=="image")n=e.form.getElementsByTagName("input");' +
                    'if(e.type=="submit")n=e.form.elements;' +
                    'while(n[x]&&e!==n[x]){' +
                    'if(n[x].type=="image")break;' +
                    'if(n[x].type=="submit")break;' +
                    'x++;' +
                    '}' +
                    '}' +
                    'if((e.form&&(e===n[x]&&"|image|submit|".includes("|"+e.type+"|"))||' +
                    '((/^option$/i.test(e.localName))&&e.defaultSelected)||' +
                    '(("|radio|checkbox|".includes("|"+e.type+"|"))&&e.defaultChecked)' +
                    ')){' +
                    source +
                    '}'
                  break
                default:
                  emit("'" + expression + "'" + qsInvalid)
                  break
              }
            }

            // *** input pseudo-classes (for form validation)
            // :checked, :indeterminate, :valid, :invalid, :in-range, :out-of-range, :required, :optional
            else if ((match = selector.match(Patterns.inputvalue))) {
              match[1] = match[1].toLowerCase()
              switch (match[1]) {
                case 'checked':
                  source =
                    'if((/^input$/i.test(e.localName)&&' +
                    '("|radio|checkbox|".includes("|"+e.type+"|")&&e.checked)||' +
                    '(/^option$/i.test(e.localName)&&(e.selected||e.checked))' +
                    ')){' +
                    source +
                    '}'
                  break
                case 'indeterminate':
                  source =
                    'if((/^progress$/i.test(e.localName)&&!e.hasAttribute("value"))||' +
                    '(/^input$/i.test(e.localName)&&("checkbox"==e.type&&e.indeterminate)||' +
                    '("radio"==e.type&&e.name&&!s.first("input[name="+e.name+"]:checked",e.form))' +
                    ')){' +
                    source +
                    '}'
                  break
                case 'required':
                  source = 'if(s.isRequired(e)){' + source + '}'
                  break
                case 'optional':
                  source =
                    'if((/^(?:button|input|select|textarea)$/i.test(e.localName)&&!s.isRequired(e))' +
                    '){' +
                    source +
                    '}'
                  break
                case 'invalid':
                  source =
                    'if(((' +
                    '(/^form$/i.test(e.localName)&&!e.noValidate)||' +
                    '(e.willValidate&&!e.formNoValidate))&&!e.checkValidity())||' +
                    '(/^fieldset$/i.test(e.localName)&&s.first(":invalid",e))' +
                    '){' +
                    source +
                    '}'
                  break
                case 'valid':
                  source =
                    'if(((' +
                    '(/^form$/i.test(e.localName)&&!e.noValidate)||' +
                    '(e.willValidate&&!e.formNoValidate))&&e.checkValidity())||' +
                    '(/^fieldset$/i.test(e.localName)&&!s.first(":invalid",e))' +
                    '){' +
                    source +
                    '}'
                  break
                case 'in-range':
                  source =
                    'if((/^input$/i.test(e.localName))&&' +
                    '(e.willValidate&&!e.formNoValidate)&&' +
                    '(!e.validity.rangeUnderflow&&!e.validity.rangeOverflow)&&' +
                    '("|date|datetime-local|month|number|range|time|week|".includes("|"+e.type+"|"))&&' +
                    '("range"==e.type||e.getAttribute("min")||e.getAttribute("max"))' +
                    '){' +
                    source +
                    '}'
                  break
                case 'out-of-range':
                  source =
                    'if((/^input$/i.test(e.localName))&&' +
                    '(e.willValidate&&!e.formNoValidate)&&' +
                    '(e.validity.rangeUnderflow||e.validity.rangeOverflow)&&' +
                    '("|date|datetime-local|month|number|range|time|week|".includes("|"+e.type+"|"))&&' +
                    '("range"==e.type||e.getAttribute("min")||e.getAttribute("max"))' +
                    '){' +
                    source +
                    '}'
                  break
                default:
                  emit("'" + expression + "'" + qsInvalid)
                  break
              }
            }

            // resources state pseudo-classes (multimedia state)
            // :playing, :paused, :seeking, :buffering, :stalled, :muted, :volume-locked
            else if ((match = selector.match(Patterns.rsrc_state))) {
              source =
                'if(s.isMediaState(e,' +
                JSON.stringify(match[1].toLowerCase()) +
                ')){' +
                source +
                '}'
            }

            // display state pseudo-classes. Helpers use native matching when
            // available and otherwise only properties observable from the DOM.
            else if ((match = selector.match(Patterns.disp_state))) {
              match[1] = match[1].toLowerCase()
              switch (match[1]) {
                case 'open':
                  source = 'if(s.isOpen(e)){' + source + '}'
                  break
                case 'closed':
                  source = 'if(s.isClosed(e)){' + source + '}'
                  break
                case 'modal':
                  source = 'if(s.isModal(e)){' + source + '}'
                  break
                case 'fullscreen':
                  source = 'if(s.isFullscreen(e)){' + source + '}'
                  break
                case 'picture-in-picture':
                  source = 'if(s.isPictureInPicture(e)){' + source + '}'
                  break
                case 'popover':
                case 'popover-open':
                  source = 'if(s.isPopoverOpen(e)){' + source + '}'
                  break
                default:
                  emit("'" + expression + "'" + qsInvalid)
                  break
              }
            }

            // Timelines belong to the host; absent native state matches nothing.
            else if ((match = selector.match(Patterns.time_state))) {
              expr = ':' + match[1].toLowerCase()
              if (expr === ':current' && match[2].charAt(0) === '(') {
                match = matchLogical(selector, /^:(current)\(/i)
                if (
                  !match ||
                  !match[2] ||
                  !splitList(match[2]).every(isCompound) ||
                  !validateLogical(match[2], false)
                ) {
                  emit("'" + expression + "'" + qsInvalid)
                  break
                }
                expr += '(' + match[2] + ')'
              }
              source =
                'if(s.matchesNative(e,' +
                JSON.stringify(expr) +
                ')){' +
                source +
                '}'
            }

            // allow pseudo-elements starting with single colon (:)
            // :after, :before, :first-letter, :first-line
            // assert: e.type is in double-colon format, like ::after
            else if ((match = selector.match(Patterns.pseudo_sng))) {
              source =
                'if(e.element&&e.type.toLowerCase()=="' +
                ':' +
                match[0].toLowerCase() +
                '"){e=e.element;' +
                source +
                '}'
            }

            // allow pseudo-elements starting with double colon (::)
            // ::after, ::before, ::marker, ::placeholder, ::selection,
            // ::inactive-selection, ::-webkit-<foo-bar>
            // assert: e.type is in double-colon format, like ::after
            else if ((match = selector.match(Patterns.pseudo_dbl))) {
              source =
                'if(e.element&&e.type.toLowerCase()=="' +
                match[0].toLowerCase() +
                '"){e=e.element;' +
                source +
                '}'
            } else {
              // reset
              expr = false
              status = false

              // process registered selector extensions
              for (expr in Selectors) {
                if ((match = selector.match(Selectors[expr].Expression))) {
                  result = Selectors[expr].Callback(
                    match,
                    source,
                    mode,
                    callback,
                  )
                  if ('match' in result) {
                    match = result.match
                  }
                  vars = result.modvar
                  if (mode) {
                    // add extra select() vars
                    vars &&
                      S_VARS.indexOf(vars) < 0 &&
                      (S_VARS[S_VARS.length] = vars)
                  } else {
                    // add extra match() vars
                    vars &&
                      M_VARS.indexOf(vars) < 0 &&
                      (M_VARS[M_VARS.length] = vars)
                  }
                  // extension source code
                  source = result.source
                  // extension status code
                  status = result.status
                  // break on status error
                  if (status) {
                    break
                  }
                }
              }

              if (!status) {
                emit("unknown pseudo-class selector '" + selector + "'")
                return ''
              }

              if (!expr) {
                emit("unknown token in selector '" + selector + "'")
                return ''
              }
            }
            break

          default:
            emit("'" + expression + "'" + qsInvalid)
            break selector_recursion_label
        }
        // end of switch symbol

        if (!match) {
          emit("'" + expression + "'" + qsInvalid)
          return ''
        }

        // pop last component
        selector = match.pop()
      }
      // end of while selector

      if (pendingTag) {
        source = pendingTag + source + '}'
      }
      return errors == previousErrors ? source : ''
    },
    // replace :scope context element as a
    // a reference in the selector string
    makeref = function (selectors, element) {
      var id, name

      // replace DOCUMENT with first element (root)
      if (element.nodeType === 9) {
        element = element.documentElement
      }

      id = idOf(element)
      // The first token of the class attribute. Read from the text rather
      // than through classList, which was the only place this engine needed
      // that API and is one more thing an older host does not have.
      name = classOf(element)
      name = name ? String(name).split(/\s+/)[0] : ''

      return selectors.replace(
        /:scope/i,
        tagOf(element) +
          (id ? '#' + escapeIdentifier(id) : '') +
          (name ? '.' + escapeIdentifier(name) : ''),
      )
    },
    // equivalent of w3c 'closest' method
    ancestor = function _closest(selectors, element, callback) {
      parse(selectors, true)
      selectors = makeref(selectors, element)
      while (element) {
        if (match(selectors, element, callback)) {
          break
        }
        element = upOf(element)
      }
      return element
    },
    match_assert = function (f, element, callback) {
      for (var i = 0, l = f.length, r = false; l > i; ++i) {
        f[i](element, callback, null, false) && (r = true)
      }
      return r
    },
    match_collect = function (selectors, callback) {
      for (var i = 0, l = selectors.length, f = []; l > i; ++i) {
        f[i] = compile(selectors[i], false, callback)
      }
      return f
    },
    // Consume string continuations before whitespace normalization. Preserve
    // escape boundaries: removing a continuation must not extend a hex escape.
    stringContinuations = function (selectors) {
      if (!/[\r\n\f]/.test(selectors)) {
        return selectors
      }
      var i = 0,
        j,
        c,
        next,
        quote = '',
        result = '',
        length = selectors.length
      while (i < length) {
        c = selectors[i++]
        if (c == '\\' && i == length && quote) {
          break
        }
        if (c == '\\' && i < length) {
          next = selectors[i]
          if (quote && /[\r\n\f]/.test(next)) {
            ++i
            if (next == '\r' && selectors[i] == '\n') {
              ++i
            }
            continue
          }
          if (quote && /[0-9a-f]/i.test(next)) {
            j = i
            while (i < length && i - j < 6 && /[0-9a-f]/i.test(selectors[i])) {
              ++i
            }
            result += '\\' + ('000000' + selectors.slice(j, i)).slice(-6)
            if (/[\x20\t\r\n\f]/.test(selectors[i] || '')) {
              next = selectors[i++]
              if (next == '\r' && selectors[i] == '\n') {
                ++i
              }
            }
            continue
          }
          result += c + selectors[i++]
          continue
        }
        if (c == quote) {
          quote = ''
        } else if (!quote && (c == '"' || c == "'")) {
          quote = c
        }
        result += c
      }
      // EOF closes a string. Keep its trailing whitespace inside that string
      // so selector trimming cannot erase a bad newline or a literal space.
      return result + quote
    },
    // unique parser entry point for all
    // methods (type matching/selecting)
    parse = function (selectors, type) {
      var parsed

      // arguments validation
      if (arguments.length === 0) {
        emit(qsNotArgs, TypeError)
        return Config.VERBOSITY ? undefined : type ? none : false
      } else if (arguments[0] === '') {
        emit("''" + qsInvalid)
        return Config.VERBOSITY ? undefined : type ? none : false
      } else if (/^[.#]?\d/.test(selectors)) {
        emit("''" + qsInvalid)
        return Config.VERBOSITY ? undefined : type ? none : false
      }

      // input NULL or UNDEFINED
      if (typeof selectors != 'string') {
        selectors = '' + selectors
      }

      // normalize input string
      parsed = stringContinuations(selectors)
        .replace(/\x00|\\$/g, '\ufffd')
        .replace(REX.CombineWSP, '\x20')
        .replace(REX.PseudosWSP, '$1')
        .replace(REX.TabCharWSP, '\t')
        .replace(REX.CommaGroup, ',')
        .replace(REX.TrimSpaces, '')

      // parse, validate and split possible compound selectors
      if (
        (selectors = parsed.match(reValidator)) &&
        selectors.join('') == parsed
      ) {
        selectors = splitList(parsed)
        if (parsed[parsed.length - 1] == ',') {
          emit(qsInvalid)
          return Config.VERBOSITY ? undefined : type ? none : false
        }
      } else {
        if (Config.FORGIVING) {
          // forgiving pseudos allow to continue even after parse errors
          if (!(parsed.includes(':is(') || parsed.includes(':where('))) {
            // 'selectors' holds the fragments the validator did match,
            // which read as a mangled selector once joined by String()
            emit("'" + parsed + "'" + qsInvalid)
            return Config.VERBOSITY ? undefined : type ? none : false
          }
          // The validator cannot read this selector, but it holds a
          // forgiving list, which may be where the part it cannot read
          // lives. Hand on the selector itself rather than the fragments the
          // validator did match: compiled, the argument of an :is() or
          // :where() is evaluated inside a try/catch, so the unreadable part
          // drops out and the rest of the selector still applies. Returning
          // the fragments compiled each of them as a selector of its own,
          // which made 'div:not(:is(svg|div))' match every element in the
          // document rather than the divs.
          selectors = splitList(parsed)
        }
      }

      return selectors
    },
    // equivalent of w3c 'matches' method
    match = function _matches(
      selectors,
      element,
      callback?: (element: Element) => unknown,
    ) {
      var resolver,
        cacheKey = !!callback + ':' + selectors

      if (element && (resolver = matchResolvers.get(cacheKey))) {
        return match_assert(resolver, element, callback)
      }

      resolver = match_collect(parse(selectors, false), callback)
      matchResolvers.set(cacheKey, resolver)

      return match_assert(resolver, element, callback)
    },
    // Invalid items do not discard the remaining forgiving selectors.
    matchForgiving = function (list, element) {
      for (var i = 0, l = list.length; l > i; ++i) {
        try {
          if (match(list[i], element)) {
            return true
          }
        } catch (e) {}
      }
      return false
    },
    // A direct-child type test needs no candidate array or relative resolver.
    hasChild = function (element, tag) {
      var child = firstOf(element)
      while (child) {
        if (tag == '*' || tagOf(child) == tag) {
          return true
        }
        child = nextOf(child)
      }
      return false
    },
    // true if element matches the selector
    has = function (list, anchor) {
      var context,
        found = false,
        i = 0,
        l = list.length,
        previous = Snapshot.anchor
      Snapshot.anchor = anchor
      try {
        for (; l > i; ++i) {
          context = /^[+~]/.test(list[i]) ? upOf(anchor) : anchor
          if (!list[i]) {
            emit(qsInvalid)
            return false
          }
          // Compile even a root sibling argument, whose candidate set is empty.
          // Later invalid items must not be hidden by an earlier match.
          if (
            collect(
              parse('* ' + list[i], true).map(function (selector) {
                return selector.slice(1).replace(/^\s+/, '')
              }),
              context || anchor,
              undefined,
              true,
            ).results.length &&
            context
          ) {
            found = true
          }
        }
        return found
      } finally {
        Snapshot.anchor = previous
      }
    },
    // equivalent of w3c 'querySelector' method
    // Reuse the stop callback when first() has no user callback.
    firstMatch = function firstMatch() {
      return false
    },
    first = function _querySelector(selectors, context, callback) {
      var element, match, collection, i, length

      // A lone '#id' against a document is the id map's own question, and the
      // first match in tree order is exactly what getElementById returns.
      // Going through select() means building the whole candidate list first,
      // and without document.all that list is built by walking the document:
      // 2.4ms against 43ns here. Duplicate ids do not change the answer, only
      // which of them comes first, and they cannot precede this one. Scoped
      // to an element the first document-order match may sit outside it, so
      // that case takes the ordinary path.
      if (
        selectors &&
        context &&
        context.nodeType == 9 &&
        context.getElementById &&
        (match = reSimpleId.exec(selectors))
      ) {
        element = context.getElementById(unescapeIdentifier(match[1]))
        if (element && typeof callback == 'function') {
          callback(element)
        }
        return element || null
      }

      // The first class/type match needs neither a copied candidate array nor
      // a resolver. Keep uncommon syntax on the fully validating path.
      if (
        !Config.LEGACY &&
        typeof selectors == 'string' &&
        selectors &&
        (match = /^([a-zA-Z][-\w]*|\*)?(?:\.([_a-zA-Z][-\w]*))?$/.exec(
          selectors,
        ))
      ) {
        context || (context = doc)
        if (
          (context.nodeType == 9 || context.nodeType == 1) &&
          context.getElementsByTagName &&
          context.getElementsByClassName
        ) {
          lastContext !== context && (lastContext = switchContext(context))
          collection = match[2]
            ? context.getElementsByClassName(match[2])
            : context.getElementsByTagName(match[1])
          element = collection[0] || null
          if (match[2] && match[1] && match[1] != '*') {
            i = 0
            while (
              element &&
              !(
                element.localName == match[1] ||
                (HTML_DOCUMENT &&
                  element.namespaceURI == NAMESPACE &&
                  element.localName == match[1].toLowerCase())
              )
            ) {
              // Reading a live collection's length can itself scan the DOM.
              // The common first-candidate hit needs no length at all.
              if (i === 0) {
                length = collection.length
              }
              element = ++i < length ? collection[i] : null
            }
          }
          if (element && typeof callback == 'function') {
            callback(element)
          }
          return element
        }
      }

      return (
        select(
          selectors,
          context,
          typeof callback == 'function'
            ? function firstMatchCallback(element) {
                callback(element)
                return false
              }
            : firstMatch,
        )[0] || null
      )
    },
    // equivalent of w3c 'querySelectorAll' method
    DESCENT_PROBE = 128,
    childPlans = createCache(),
    selectChildren = function (selectors, context) {
      var plan = childPlans.get(selectors),
        found,
        roots,
        root,
        candidates,
        element,
        parent,
        previous,
        results = [],
        unordered = false,
        i,
        j,
        k,
        length

      if (plan === undefined) {
        // Selective class anchors followed by direct-child type selectors.
        // The general compiler owns escapes, namespaces, and other syntax.
        found =
          /^([a-z][a-z0-9-]*)?\.([_a-zA-Z][-\w]*)([\t\n\f\r ]*>[\t\n\f\r ]*[a-z][a-z0-9-]*(?:[\t\n\f\r ]*>[\t\n\f\r ]*[a-z][a-z0-9-]*)*)$/.exec(
            selectors,
          )
        plan = found
          ? {
              tag: found[1],
              cls: found[2],
              tags: found[3].split(/\s*>\s*/).slice(1),
            }
          : null
        childPlans.set(selectors, plan)
      }
      if (!plan) {
        return null
      }
      roots = context.getElementsByClassName(plan.cls)
      length = roots.length
      // Decide from live counts before copying or walking a wide anchor set.
      // A changed tree can choose a different route on the next call.
      if (length > DESCENT_PROBE) {
        return null
      }
      for (i = 0; i < length; ++i) {
        root = roots[i]
        if (plan.tag !== undefined && root.localName != plan.tag) {
          continue
        }
        if (previous && previous.contains(root)) {
          unordered = true
        }
        previous = root
        // A scoped type lookup skips unrelated children and their subtrees.
        // Validate the fixed parent chain against this exact anchor: nested
        // anchors must neither duplicate nor borrow one another's matches.
        candidates = root.getElementsByTagName(plan.tags[plan.tags.length - 1])
        for (j = 0, k = candidates.length; j < k; ++j) {
          element = candidates[j]
          parent = element.parentElement
          for (var depth = plan.tags.length - 2; depth >= 0; --depth) {
            if (!parent || parent.localName != plan.tags[depth]) {
              break
            }
            parent = parent.parentElement
          }
          if (depth < 0 && parent === root) {
            results[results.length] = element
          }
        }
      }
      if (unordered && results.length > 1) {
        results.sort(documentOrder)
      }
      return results
    },
    partCounts = createCache(),
    reTagChain =
      /^[.A-Za-z][-\w]*(?:\.[-\w]+)?(?:\x20[.A-Za-z][-\w]*(?:\.[-\w]+)?)+$/,
    reChainPart = /^([A-Za-z][-\w]*)?(?:\.([-\w]+))?$/,
    fetchLevel = function (part, root, out) {
      var found, i, l

      if (part.cls !== undefined) {
        found = root.getElementsByClassName(part.cls)
        if (part.tag === undefined) {
          for (i = 0, l = found.length; l > i; ++i) {
            out[out.length] = found[i]
          }
        } else {
          for (i = 0, l = found.length; l > i; ++i) {
            if (
              found[i].localName == part.tag ||
              (HTML_DOCUMENT &&
                found[i].namespaceURI == NAMESPACE &&
                found[i].localName == part.tag.toLowerCase())
            ) {
              out[out.length] = found[i]
            }
          }
        }
      } else {
        found = root.getElementsByTagName(part.tag)
        for (i = 0, l = found.length; l > i; ++i) {
          out[out.length] = found[i]
        }
      }

      return out
    },
    countPart = function (part, context) {
      var count,
        key = part.cls !== undefined ? '.' + part.cls : part.tag

      if ((count = partCounts.get(key)) === undefined) {
        count = (
          part.cls !== undefined
            ? context.getElementsByClassName(part.cls)
            : context.getElementsByTagName(part.tag)
        ).length
        partCounts.set(key, count)
      }

      return count
    },
    descendChain = function (chain, context) {
      var budget = -1,
        i,
        j,
        k,
        l,
        level,
        m,
        next,
        node,
        part,
        prev,
        size,
        spent = 0,
        want

      // a DocumentFragment has neither lookup, and byClass()/byTag() walk it
      // by hand; the ordinary path already knows how. A legacy host reads its
      // levels through helpers, which is the ordinary path's job as well.
      if (
        Config.LEGACY ||
        context.nodeType != 9 ||
        !context.getElementsByClassName ||
        !context.getElementsByTagName
      ) {
        return null
      }

      l = chain.length
      level = fetchLevel(chain[0], context, [])
      size = level.length

      for (k = 1; l > k; ++k) {
        // What descending costs is one scoped lookup per element of every
        // level it iterates; what it replaces is one pass over the elements of
        // the last part. So that count is the budget, and the levels still to
        // come are bounded by how many elements of their part the whole
        // context holds. Both are counts of a live collection, which is a scan
        // of the context, so they are only asked for once a level is wide
        // enough for the answer to change the route: 0.060ms over 6344
        // elements against 0.78us for the scoped lookup being decided, so a
        // level of a hundred elements is cheaper to iterate than to ask about.
        //
        // A constant limit cannot decide this, because the same number means
        // different things in different documents. 'ul li a' iterates 160 +
        // 604 elements against 2370 anchors and descending wins by 2.6x; '.app
        // .card .row a' iterates 1 + 400 + 800 against 430 anchors and loses.
        // Bounding the levels to come is what declines the second one before
        // it has spent 400 lookups finding that out.
        if (size > DESCENT_PROBE) {
          // A count of zero is not answered as an empty result here. The
          // counts are remembered, and a remembered one can be older than the
          // document: it may only choose between two routes that agree, never
          // stand in for what one of them would have found.
          if (budget < 0) {
            budget = countPart(chain[l - 1], context)
          }
          want = spent + size
          for (m = k + 1; l > m; ++m) {
            want += countPart(chain[m - 1], context)
          }
          if (want > budget) {
            return null
          }
        }
        spent += size
        part = chain[k]
        next = []
        prev = null
        for (i = 0, j = level.length; j > i; ++i) {
          node = level[i]
          // contained by the last element kept, so its matches are already
          // covered and would come back a second time
          if (prev !== null && prev.contains(node)) {
            continue
          }
          prev = node
          fetchLevel(part, node, next)
        }
        level = next
        size = level.length
      }

      return level
    },
    parseChain = function (selectors) {
      var i,
        l,
        match,
        parts = selectors.split('\x20')

      for (i = 0, l = parts.length; l > i; ++i) {
        match = reChainPart.exec(parts[i])
        if (!match || (match[1] === undefined && match[2] === undefined)) {
          return null
        }
        parts[i] = { tag: match[1], cls: match[2] }
      }

      return parts
    },
    descentDeclined = createCache(),
    select = function _querySelectorAll(selectors, context, callback) {
      var descended,
        nodes = [],
        resolver

      arguments.length == 0 && emit(qsNotArgs, TypeError)

      context || (context = doc)
      lastContext !== context && (lastContext = switchContext(context))

      if (
        typeof selectors == 'string' &&
        selectors.includes('>') &&
        callback === undefined &&
        !Config.LEGACY &&
        HTML_DOCUMENT &&
        context.nodeType == 9 &&
        (descended = selectChildren(selectors, context))
      ) {
        return Config.NODE_LIST ? toNodeList(descended) : descended
      }

      // A plain descendant chain of tags is answered by descending, when the
      // shape of the document makes that the cheaper direction. No callback:
      // the ordinary path is what applies one, and this returns the answer
      // rather than a candidate list.
      if (
        selectors &&
        typeof selectors == 'string' &&
        callback === undefined &&
        descentDeclined.get(selectors) === undefined &&
        reTagChain.test(selectors) &&
        (descended = parseChain(selectors))
      ) {
        descended = descendChain(descended, context)
        if (descended) {
          return !Config.NODE_LIST
            ? descended
            : isInstanceOf(descended)
              ? descended
              : toNodeList(descended)
        }
        descentDeclined.set(selectors, true)
      }

      if (selectors) {
        if ((resolver = selectResolvers.get(selectors))) {
          var i,
            l,
            list,
            f = resolver.factory,
            n = resolver.nodeset
          if (n.length > 1) {
            for (i = 0, l = n.length; l > i; ++i) {
              list = fetch[n[i][0]](n[i].slice(1), context)
              if (f[i] !== null) {
                f[i](list, callback, context, nodes)
              } else {
                nodes = nodes.concat(list)
              }
            }
            if (l > 1 && nodes.length > 1) {
              nodes.sort(documentOrder)
              hasDupes && (nodes = unique(nodes))
            }
          } else if (n.length) {
            list = fetch[n[0][0]](n[0].slice(1), context)
            nodes = f[0] ? f[0](list, callback, context, nodes) : list
          }
          if (typeof callback == 'function') {
            nodes = concatCall(nodes, callback)
          }
          return !Config.NODE_LIST
            ? nodes
            : isInstanceOf(nodes)
              ? nodes
              : toNodeList(nodes)
        }
      }

      resolver = collect(parse(selectors, true), context, callback)
      nodes = resolver.results

      // Cache the query plan, never the answer. 'results' is a live list of
      // matched elements and 'htmlset' closes over the context, so caching
      // the whole collection kept a removed subtree alive for as long as its
      // selector stayed in the cache. What is kept here is context-free,
      // which also lets a plan be reused across contexts instead of only for
      // the one it was built against.
      selectResolvers.set(selectors, {
        factory: resolver.factory,
        nodeset: resolver.nodeset,
      })

      if (typeof callback == 'function') {
        nodes = concatCall(nodes, callback)
      }
      return !Config.NODE_LIST
        ? nodes
        : isInstanceOf(nodes)
          ? nodes
          : toNodeList(nodes)
    },
    // optimize selectors avoiding duplicated checks
    optimize = function (selector, token) {
      var index = token.index,
        length = token[1].length + token[2].length
      return (
        selector.slice(0, index) +
        (' >+~'.indexOf(selector.charAt(index - 1)) > -1
          ? ':['.indexOf(selector.charAt(index + length + 1)) > -1
            ? '*'
            : ''
          : '') +
        selector.slice(index + length - (token[1] == '*' ? 1 : 0))
      )
    },
    // prepare factory resolvers and closure collections
    collect = function (selectors, context, callback, relative?) {
      var i,
        l,
        seen = {},
        token = ['', '*', '*'],
        optimized = selectors,
        factory = [],
        htmlset = [],
        nodeset = [],
        results = [],
        type

      for (i = 0, l = selectors.length; l > i; ++i) {
        if (!seen[selectors[i]] && (seen[selectors[i]] = true)) {
          type = selectors[i].match(reOptimizer)
          if (type && type[1] != ':' && (token = type)) {
            token[1] || (token[1] = '*')
            optimized[i] = optimize(optimized[i], token)
          } else {
            token = ['', '*', '*']
            // A terminal union of types can fetch its alternatives instead
            // of every element. Keep the complete predicate in the resolver,
            // including any compound or ancestor constraints around the list.
            type =
              /:(?:is|where)\(([a-z][a-z0-9-]*(?:[\t\n\f\r ]*,[\t\n\f\r ]*[a-z][a-z0-9-]*)+)\)$/.exec(
                selectors[i],
              )
            if (
              type &&
              /^[.#*\w\t\n\f\r >+~-]*$/.test(selectors[i].slice(0, type.index))
            ) {
              token = ['', '?', type[1]]
            }
          }
          // Class lookup narrows candidates; the attribute resolver still
          // checks case and values, including in quirks mode.
          if (
            HTML_DOCUMENT &&
            !Config.LEGACY &&
            (type = selectors[i].match(Patterns.attribute)) &&
            type[0] == selectors[i] &&
            type[1] == 'class' &&
            type[2] == '~=' &&
            type[4] &&
            type[5] != 'i' &&
            !/[\t\n\f\r ]/.test(unescapeIdentifier(type[4])) &&
            Operators['~='].p1 == '(^|[\\t\\n\\f\\r ])' &&
            Operators['~='].p2 == '([\\t\\n\\f\\r ]|$)' &&
            Operators['~='].p3 == 'true'
          ) {
            token = ['', '.', type[4]]
          }
        }

        // unescape before recording the token: 'nodeset' is what a later
        // run rebuilds its candidate list from, so the two must agree
        token[2] = unescapeIdentifier(token[2])
        nodeset[i] = token[1] + token[2]
        // An escaped space cannot be part of a class token.
        htmlset[i] =
          token[1] == '.' && /[\t\n\f\r ]/.test(token[2])
            ? () => []
            : compat[token[1]](context, token[2])
        factory[i] = compile(optimized[i], true, null, relative)

        if (factory[i]) {
          factory[i](htmlset[i](), callback, context, results)
        } else {
          concatList(results, htmlset[i]())
        }
      }

      if (l > 1) {
        results.sort(documentOrder)
        hasDupes && (results = unique(results))
      }

      return {
        callback: callback,
        context: context,
        factory: factory,
        htmlset: htmlset,
        nodeset: nodeset,
        results: results,
      }
    },
    // handlers needed for the :hover pseudo-class
    // track state change in browsers and headless
    hoverWanted = false,
    // null is uninitialized; undefined means WeakMap is unavailable.
    hoverTracked = null,
    hoverDoc,
    hoverRecord,
    hoverChanged = function (event) {
      var targetDoc = event.target.ownerDocument || event.target,
        record = hoverTracked
          ? hoverTracked.get(targetDoc)
          : targetDoc === hoverDoc
            ? hoverRecord
            : undefined
      if (record) {
        record.target = event.type == 'mouseover' ? event.target : undefined
        if (targetDoc === doc) {
          Snapshot.HOVER = record.target
        }
      }
    },
    trackHover = function () {
      hoverWanted = true
      if (!doc) {
        return
      }
      if (hoverTracked === null) {
        hoverTracked = createWeakMap()
      }
      var record = hoverTracked
        ? hoverTracked.get(doc)
        : hoverDoc === doc
          ? hoverRecord
          : undefined
      if (!record) {
        record = { target: undefined }
        if (hoverTracked) {
          hoverTracked.set(doc, record)
        }
        // Stable callbacks avoid duplicate listeners even without WeakMap.
        doc.addEventListener('mouseover', hoverChanged, true)
        doc.addEventListener('mouseout', hoverChanged, true)
      }
      hoverDoc = doc
      hoverRecord = record
      Snapshot.HOVER = record.target
    },
    // QSA placeholders to native references
    _closest,
    _matches,
    _querySelector,
    _querySelectorAll,
    _querySelectorDoc,
    _querySelectorAllDoc,
    // overrides QSA methods (only for browsers)
    // Build [ ...args, tail ] in one allocation. The QSA wrappers below hand
    // their own arguments plus a resolver to parseQSArgs; slicing and then
    // concatenating allocates twice, ~113ns per call against ~9ns sized by
    // arity. Unrolled to eight, well past the three these wrappers take,
    // because the cases cost nothing to carry and a longer call still lands on
    // the general form.
    argsWith = function (args, tail) {
      switch (args.length) {
        case 0:
          return [tail]
        case 1:
          return [args[0], tail]
        case 2:
          return [args[0], args[1], tail]
        case 3:
          return [args[0], args[1], args[2], tail]
        case 4:
          return [args[0], args[1], args[2], args[3], tail]
        case 5:
          return [args[0], args[1], args[2], args[3], args[4], tail]
        case 6:
          return [args[0], args[1], args[2], args[3], args[4], args[5], tail]
        case 7:
          return [
            args[0],
            args[1],
            args[2],
            args[3],
            args[4],
            args[5],
            args[6],
            tail,
          ]
        case 8:
          return [
            args[0],
            args[1],
            args[2],
            args[3],
            args[4],
            args[5],
            args[6],
            args[7],
            tail,
          ]
        default:
          return sliceCall(args).concat(tail)
      }
    },
    install = function (all) {
      // Saved DOM methods are invoked with their receiver or restored below.
      /* oxlint-disable typescript/unbound-method */
      _closest = Element.prototype.closest
      _matches = Element.prototype.matches

      _querySelector = Element.prototype.querySelector
      _querySelectorAll = Element.prototype.querySelectorAll

      _querySelectorDoc = Document.prototype.querySelector
      _querySelectorAllDoc = Document.prototype.querySelectorAll
      /* oxlint-enable typescript/unbound-method */

      function parseQSArgs() {
        var method = arguments[arguments.length - 1]
        return arguments.length < 2
          ? method.apply(this, [])
          : arguments.length < 3
            ? method.apply(this, [arguments[0], this])
            : method.apply(this, [
                arguments[0],
                this,
                typeof arguments[1] == 'function' ? arguments[1] : undefined,
              ])
      }

      Element.prototype.closest = HTMLElement.prototype.closest =
        function closest() {
          return parseQSArgs.apply(this, argsWith(arguments, ancestor))
        }

      Element.prototype.matches = HTMLElement.prototype.matches =
        function matches() {
          return parseQSArgs.apply(this, argsWith(arguments, match))
        } as unknown as Element['matches']

      Element.prototype.querySelector = HTMLElement.prototype.querySelector =
        function querySelector() {
          return parseQSArgs.apply(this, argsWith(arguments, first))
        }

      Element.prototype.querySelectorAll =
        HTMLElement.prototype.querySelectorAll = function querySelectorAll() {
          return parseQSArgs.apply(this, argsWith(arguments, select))
        }

      Document.prototype.querySelector =
        DocumentFragment.prototype.querySelector = function querySelector() {
          return parseQSArgs.apply(this, argsWith(arguments, first))
        }

      Document.prototype.querySelectorAll =
        DocumentFragment.prototype.querySelectorAll =
          function querySelectorAll() {
            return parseQSArgs.apply(this, argsWith(arguments, select))
          }

      if (all) {
        doc.addEventListener(
          'load',
          function (e) {
            var c,
              d,
              r,
              s,
              t = e.target
            if (/iframe/i.test(t.localName)) {
              c = '(' + Export + ')(this, ' + Factory + ');'
              d = t.ownerDocument
              s = d.createElement('script')
              s.textContent = c + 'NW.Dom.install(true)'
              r = d.documentElement
              r.removeChild(r.insertBefore(s, r.firstChild))
            }
          },
          true,
        )
      }
    },
    // restore QSA methods (only for browsers)
    uninstall = function () {
      // restore references
      if (_closest) {
        Element.prototype.closest = _closest
        HTMLElement.prototype.closest = _closest
      }
      if (_matches) {
        Element.prototype.matches = _matches
        HTMLElement.prototype.matches = _matches
      }
      if (_querySelector) {
        Element.prototype.querySelector = HTMLElement.prototype.querySelector =
          _querySelector
        Element.prototype.querySelectorAll =
          HTMLElement.prototype.querySelectorAll = _querySelectorAll
      }
      if (_querySelectorAllDoc) {
        Document.prototype.querySelector =
          DocumentFragment.prototype.querySelector = _querySelectorDoc
        Document.prototype.querySelectorAll =
          DocumentFragment.prototype.querySelectorAll = _querySelectorAllDoc
      }
    },
    // empty set
    none = Array(),
    // context
    lastContext,
    // cached lambdas
    matchLambdas = createCache(),
    selectLambdas = createCache(),
    // cached resolvers
    matchResolvers = createCache(),
    selectResolvers = createCache(),
    // passed to resolvers
    Snapshot: {
      mayMatch: typeof mayMatch
      ancestorMask: typeof ancestorMask
      clearAncestorMasks: typeof clearAncestorMasks
      classOf: typeof classOf
      attrOf: typeof legacyAttrOf
      hasAttrOf: typeof legacyHasAttrOf
      tagOf: typeof legacyTagOf
      idOf: typeof legacyIdOf
      legacyClassOf: typeof legacyClassOf
      upOf: typeof legacyUpOf
      nextOf: typeof legacyNextOf
      prevOf: typeof legacyPrevOf
      firstOf: typeof legacyFirstOf
      connectedOf: typeof legacyConnectedOf
      anchor: Element | null
      isDefined: typeof isDefined
      HOVER?: EventTarget
      doc: Document
      from: Node
      root: Element
      byTag: typeof byTag
      has: typeof has
      hasChild: typeof hasChild
      first: typeof first
      match: typeof match
      matchForgiving: typeof matchForgiving
      select: typeof select
      ancestor: typeof ancestor
      nthOfType: typeof nthOfType
      nthElement: typeof nthElement
      isMediaState: typeof isMediaState
      matchesNative: typeof matchesNative
      isRequired: typeof isRequired
      isDisabled: typeof isDisabled
      isOpen: typeof isOpen
      isClosed: typeof isClosed
      isModal: typeof isModal
      isFullscreen: typeof isFullscreen
      isPictureInPicture: typeof isPictureInPicture
      isPopoverOpen: typeof isPopoverOpen
      isFocusable: typeof isFocusable
      isContentEditable: typeof isContentEditable
      isLink: typeof isLink
      hasAttributeNS: typeof hasAttributeNS
    } = {
      doc: doc,
      from: doc,
      root: root,
      anchor: null,

      byTag: byTag,
      attrOf: legacyAttrOf,
      hasAttrOf: legacyHasAttrOf,
      tagOf: legacyTagOf,
      idOf: legacyIdOf,
      legacyClassOf: legacyClassOf,
      upOf: legacyUpOf,
      nextOf: legacyNextOf,
      prevOf: legacyPrevOf,
      firstOf: legacyFirstOf,
      connectedOf: legacyConnectedOf,

      has: has,
      hasChild: hasChild,
      first: first,
      match: match,
      matchForgiving: matchForgiving,
      select: select,

      ancestor: ancestor,

      mayMatch: mayMatch,
      ancestorMask: ancestorMask,
      clearAncestorMasks: clearAncestorMasks,

      nthOfType: nthOfType,
      nthElement: nthElement,

      matchesNative: matchesNative,
      isDefined: isDefined,
      isRequired: isRequired,
      isOpen: isOpen,
      isClosed: isClosed,
      isDisabled: isDisabled,
      isModal: isModal,
      isFullscreen: isFullscreen,
      classOf: classOf,
      isPictureInPicture: isPictureInPicture,
      isPopoverOpen: isPopoverOpen,
      isFocusable: isFocusable,
      isContentEditable: isContentEditable,
      isLink: isLink,
      hasAttributeNS: hasAttributeNS,
      isMediaState: isMediaState,
    },
    // public exported methods/objects
    Dom = {
      // exported cache objects

      matchLambdas: matchLambdas,
      selectLambdas: selectLambdas,

      matchResolvers: matchResolvers,
      selectResolvers: selectResolvers,

      // exported compiler macros

      CFG: CFG,

      S_BODY: S_BODY,
      M_BODY: M_BODY,
      N_BODY: M_BODY,

      S_TEST: S_TEST,
      M_TEST: M_TEST,
      N_TEST: N_TEST,

      // exported engine methods

      byId: byId,
      byTag: byTag,
      byClass: byClass,

      first: first,
      match: match,
      select: select,

      closest: ancestor,

      compile: compile,
      configure: configure,

      emit: emit,
      Config: Config,
      Snapshot: Snapshot,

      Version: version,

      install: install,
      uninstall: uninstall,

      Operators: Operators,
      Selectors: Selectors,

      // register a new selector combinator symbol and its related function resolver
      registerCombinator: function (combinator, resolver) {
        var i = 0,
          l = combinator.length,
          symbol
        for (; l > i; ++i) {
          if (combinator[i] != '=') {
            symbol = combinator[i]
            break
          }
        }
        if (CFG.combinators.indexOf(symbol) < 0) {
          CFG.combinators = CFG.combinators.replace('](', symbol + '](')
          CFG.combinators = CFG.combinators.replace('])', symbol + '])')
          Combinators[combinator] = resolver
          setIdentifierSyntax()
        } else {
          console.warn(
            "Warning: the '" +
              combinator +
              "' combinator is already registered.",
          )
        }
      },

      // register a new attribute operator symbol and its related function resolver
      registerOperator: function (operator, resolver) {
        var i = 0,
          l = operator.length,
          symbol
        for (; l > i; ++i) {
          if (operator[i] != '=') {
            symbol = operator[i]
            break
          }
        }
        if (CFG.operators.indexOf(symbol) < 0 && !Operators[operator]) {
          CFG.operators = CFG.operators.replace(']=', symbol + ']=')
          Operators[operator] = resolver
          setIdentifierSyntax()
        } else {
          console.warn(
            "Warning: the '" + operator + "' operator is already registered.",
          )
        }
      },

      // register a new selector symbol and its related function resolver
      registerSelector: function (name, rexp, func) {
        Selectors[name] ||
          (Selectors[name] = {
            Expression: rexp,
            Callback: func,
          })
      },
    }

  initialize(doc)

  return Dom
})
