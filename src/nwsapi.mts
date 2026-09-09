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

// Keep the UMD source a script. Runtime imports would change its wrapper.
type LegacyHooks = import('./internal/legacy.d.ts').LegacyHooks
type LegacyHookFactory = import('./internal/legacy.d.ts').LegacyHookFactory
type LegacyReaders = import('./internal/legacy.d.ts').LegacyReaders

type EngineContext = (Document | Element | DocumentFragment) &
  Partial<
    Pick<
      Document,
      | 'getElementsByTagName'
      | 'getElementsByTagNameNS'
      | 'getElementsByClassName'
      | 'getElementById'
      | 'defaultView'
    >
  >
type EngineElement = Element &
  Partial<
    Pick<HTMLInputElement, 'disabled' | 'required' | 'type' | 'tabIndex'>
  > & {
    webkitPresentationMode?: string
    contentDocument?: Document | null
    href?: string
    style?: CSSStyleDeclaration
    open?: boolean
  }
type EngineGlobal = typeof globalThis & { NW?: { Dom?: unknown } }
type ElementCallback = ((element: Element) => unknown) | null | undefined
interface NativeMatcherRecord {
  fallback: Element['matches'] | null | undefined
  matcher: Element['matches'] | null | false | undefined
  delegates: boolean
}
interface ForeignTypeState {
  observer: MutationObserver | null
  foreign: boolean
  dirty: boolean
}
interface CollectionState<Value> {
  copies: WeakMap<object, Value>
  observer: MutationObserver | null
}
interface CollectionSnapshotState extends CollectionState<Element[]> {
  document: WeakRef<Document>
}
interface PrefixSnapshot {
  nodes: Element[]
  classes: PlanCache<Element[]>
}
interface CompiledResolver {
  filtered?: boolean
  (
    candidate: Element,
    callback: ElementCallback,
    context: EngineContext | null,
    result: false,
    filtered?: Record<string, FilteredNthState>,
  ): boolean
  (
    candidates: ArrayLike<Element>,
    callback: ElementCallback,
    context: EngineContext | null,
    result?: Element[],
  ): Element[]
}
interface QueryPlan {
  factory: Array<CompiledResolver | null>
  nodeset: string[]
}
interface FilteredSiblings {
  nodes: Element[]
  positions: WeakMap<Element, number> | undefined
}
interface FilteredNthState {
  parents?: WeakMap<Node, FilteredSiblings> | undefined
  parent?: Node
  siblings?: FilteredSiblings
}
interface SelectorExtension {
  Expression: RegExp
  Callback(
    match: RegExpMatchArray,
    source: string,
    mode: boolean | null,
    callback: boolean | ElementCallback,
  ): {
    source: string
    status: boolean
    match: RegExpMatchArray
    modvar?: string
  }
}

// The caches hold compiled plans, not query result sets.
interface PlanCache<Value> {
  clear(): void
  get(key: string): Value | undefined
  set(key: string, value: Value): Value
  size(): number
}
interface CompilerAncestry {
  required: string[]
  pending: string[]
  walk: boolean
}
interface IdentifierSyntax {
  optimizer: RegExp
  validator: RegExp
  simpleId: RegExp
  id: RegExp
  tagName: RegExp
  className: RegExp
  attribute: RegExp
}
interface DirectionHelpers {
  directionality(element: Element): 'ltr' | 'rtl'
}
interface AttributeOperator {
  p1: string
  p2: string
  p3: string
}
interface Primordials {
  MapCtor: MapConstructor | undefined
  WeakMapCtor: WeakMapConstructor | undefined
  WeakRefCtor: WeakRefConstructor | undefined
  FinalizationRegistryCtor: FinalizationRegistryConstructor | undefined
  SymbolIterator: typeof Symbol.iterator | undefined
  StringPrototypeIncludes: LegacyReaders['includes'] | undefined
  StringFromCharCode: typeof String.fromCharCode
  StringFromCodePoint: typeof String.fromCodePoint | undefined
  ObjectCreate: typeof Object.create
  ObjectDefineProperty: typeof Object.defineProperty
  ObjectDefineProperties: typeof Object.defineProperties
  ObjectPrototypeHasOwnProperty(value: object, name: PropertyKey): boolean
  ArrayPrototypeSlice(nodes: ArrayLike<Element>): Element[]
}

;(function Export(
  global: EngineGlobal | undefined,
  factory: (global: EngineGlobal) => unknown,
) {
  'use strict'

  // Load shims before the library. All engines share these startup references.
  var uncurryThis = Function.prototype.bind.bind(Function.prototype.call),
    FunctionPrototypeToString = uncurryThis(Function.prototype.toString),
    // Native-source pattern adapted from Lodash. See LICENSE for attribution.
    nativePattern = RegExp(
      '^' +
        FunctionPrototypeToString(Object.prototype.hasOwnProperty)
          .replace(
            /[\\^$.*+?()[\]{}|]/g,
            (character: string) => '\\' + character,
          )
          .replace(
            /hasOwnProperty|(function).*?(?=\\\()| for .+?(?=\\\])/g,
            (_match: string, keyword: string | undefined) =>
              (keyword || '') + '.*?',
          ) +
        '$',
    ),
    isNative = function (value: unknown) {
      if (typeof value != 'function') {
        return false
      }
      try {
        return nativePattern.test(FunctionPrototypeToString(value))
      } catch (_error) {
        return false
      }
    },
    StringPrototypeIncludes = String.prototype.includes,
    // oxlint-disable-next-line compat/compat -- Snapshot the optional method and validate it before any call.
    StringFromCodePoint = String.fromCodePoint,
    ObjectPrototypeHasOwnProperty = Object.prototype.hasOwnProperty,
    primordials: Primordials = {
      MapCtor: typeof Map == 'function' ? Map : undefined,
      WeakMapCtor: typeof WeakMap == 'function' ? WeakMap : undefined,
      WeakRefCtor: typeof WeakRef == 'function' ? WeakRef : undefined,
      FinalizationRegistryCtor:
        typeof FinalizationRegistry == 'function'
          ? FinalizationRegistry
          : undefined,
      // oxlint-disable-next-line compat/compat -- A missing Symbol or iterator disables iteration support.
      SymbolIterator: typeof Symbol == 'function' ? Symbol.iterator : undefined,
      StringPrototypeIncludes: isNative(StringPrototypeIncludes)
        ? uncurryThis(StringPrototypeIncludes)
        : undefined,
      StringFromCharCode: String.fromCharCode,
      StringFromCodePoint: isNative(StringFromCodePoint)
        ? StringFromCodePoint
        : undefined,
      ObjectCreate: Object.create,
      ObjectDefineProperty: Object.defineProperty,
      ObjectDefineProperties: Object.defineProperties,
      ObjectPrototypeHasOwnProperty: uncurryThis(ObjectPrototypeHasOwnProperty),
      ArrayPrototypeSlice: uncurryThis(Array.prototype.slice),
    }
  // Ordinary shims cannot provide weak ownership. Disable those optimizations.
  if (!isNative(primordials.WeakRefCtor)) {
    primordials.WeakRefCtor = undefined
  }
  if (!isNative(primordials.FinalizationRegistryCtor)) {
    primordials.FinalizationRegistryCtor = undefined
  }
  var mapNames = ['MapCtor', 'WeakMapCtor'] as const
  for (var mapIndex = 0; mapIndex < mapNames.length; ++mapIndex) {
    var name = mapNames[mapIndex]!,
      Constructor = primordials[name]
    if (!isNative(Constructor)) {
      primordials[name] = undefined
      continue
    }
    try {
      var map = new (Constructor as WeakMapConstructor)(),
        key = Object.freeze({}),
        other = {}
      if (
        !isNative(map.get) ||
        !isNative(map.set) ||
        !isNative(map.has) ||
        !isNative(map.delete) ||
        map.set(key, other) !== map ||
        map.get(key) !== other ||
        map.has(other) ||
        !map.delete(key) ||
        map.has(key)
      ) {
        primordials[name] = undefined
      }
    } catch (_error) {
      primordials[name] = undefined
    }
  }
  primordials.ObjectDefineProperty(factory, '_primordials', {
    value: primordials,
  })

  primordials.ObjectDefineProperty(factory, '_direction', {
    value: /* @bundle:direction */ {} as DirectionHelpers,
  })

  // Share immutable grammar templates, never the mutable lastIndex of a
  // validation regexp. Custom grammars stay local and are not retained here.
  var defaultSyntax: IdentifierSyntax | undefined
  primordials.ObjectDefineProperty(factory, '_identifierSyntax', {
    value: function (operators: string, combinators: string): IdentifierSyntax {
      var standard =
        operators == '[~*^$|]=|=' && combinators == '[\\x20\\t>+~](?=[^>+~])'
      if (standard && defaultSyntax) {
        return defaultSyntax
      }
      var HSP = '\\x20\\t',
        VSP = '\\r\\n\\f',
        WSP = '[' + HSP + VSP + ']'
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
        // CSS identifiers use their own grammar, not JavaScript ID_Start.
        // Keep the non-ASCII range accepted by browser selector APIs.
        noascii = '[^\\x00-\\x7f]',
        unicode = '\\\\[0-9a-fA-F]{1,6}',
        escaped = '(?:' + unicode + WSP + '?|\\\\[^' + VSP + '])',
        identStart = '(?:[_a-zA-Z]|' + noascii + '|' + escaped + ')',
        identifier =
          '(?:--|-?' +
          identStart +
          ')(?:[\\w-]|' +
          noascii +
          '|' +
          escaped +
          ')*',
        pseudonames = '[-\\w]+',
        pseudoparms = '(?:[-+]?(?:\\d*n(?:\\s?[-+]?\\s?\\d*)?|\\d+))',
        doublequote =
          '"[^"\\\\' + VSP + ']*(?:\\\\.[^"\\\\' + VSP + ']*)*(?:"|$)',
        singlequote =
          "'[^'\\\\" + VSP + "]*(?:\\\\.[^'\\\\" + VSP + "]*)*(?:'|$)",
        attrparser = identifier + '|' + doublequote + '|' + singlequote,
        attrvalues = '([\\x22\\x27]?)((?!\\3)*|(?:\\\\?.)*?)(?:\\3|$)',
        attributes =
          '\\[' +
          // attribute presence
          WSP +
          '?' +
          '(?:\\*\\||\\|)?' +
          '(' +
          identifier +
          '(?::' +
          identifier +
          ')?)' +
          WSP +
          '?' +
          '(?:' +
          '(' +
          operators +
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
          '?\\b([iIsS]))?' +
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
          '(?:\\*\\||\\||\\*)|' +
          '(?:' +
          '(?::' +
          pseudonames +
          '(?:\\x28' +
          pseudoparms +
          '?(?:\\x29|$))?|' +
          ')|' +
          // String tokens are valid arguments for language ranges.
          doublequote +
          '|' +
          singlequote +
          '|' +
          // Function arguments can contain numbers without making them idents.
          '(?:[-+]?\\d+)|' +
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
          '(?:\\*\\||\\||\\*)|' +
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
          combinators +
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

      var optimizer = RegExp(
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

      var syntax = {
        optimizer: optimizer,
        validator: RegExp(standardValidator, 'g'),
        simpleId: RegExp('^#(' + identifier + ')$'),
        id: RegExp('^#(' + identifier + ')(.*)'),
        tagName: RegExp('^(' + identifier + ')(.*)'),
        className: RegExp('^\\.(' + identifier + ')(.*)'),
        attribute: RegExp('^(?:' + attrmatcher + ')(.*)'),
      }
      if (standard) {
        defaultSyntax = syntax
      }
      return syntax
    },
  })

  // Keep observer callbacks outside an engine's closure. Weak ownership lets
  // an engine and its snapshots disappear while the document stays alive.
  var collectionFinalizer: FinalizationRegistry<WeakRef<MutationObserver>>
  primordials.ObjectDefineProperty(factory, '_observeCollections', {
    value: function <Value>(
      root: Node,
      view: Pick<typeof globalThis, 'MutationObserver'>,
      state: CollectionState<Value> | ForeignTypeState,
    ) {
      var reference = new primordials.WeakRefCtor!(state)
      var observer = new view.MutationObserver(function (
        _records,
        current: { disconnect: () => void },
      ) {
        var snapshot = reference.deref()
        if (snapshot) {
          if ('dirty' in snapshot) {
            snapshot.dirty = true
          } else {
            snapshot.copies = new primordials.WeakMapCtor!()
          }
        } else {
          current.disconnect()
        }
      })
      if (primordials.FinalizationRegistryCtor) {
        collectionFinalizer ||
          (collectionFinalizer = new primordials.FinalizationRegistryCtor<
            WeakRef<MutationObserver>
          >(function (reference) {
            var observer = reference.deref()
            if (observer) {
              observer.disconnect()
            }
          }))
        collectionFinalizer.register(
          state,
          new primordials.WeakRefCtor!(observer),
        )
      }
      observer.observe(
        root,
        'dirty' in state
          ? { childList: true, subtree: true }
          : {
              childList: true,
              subtree: true,
              attributes: true,
              attributeFilter: ['class'],
            },
      )
      return observer
    },
  })

  if (typeof module == 'object' && typeof exports == 'object') {
    module.exports = factory
    primordials.ObjectDefineProperty(module.exports, 'DOMSelector', {
      get: function () {
        return require('./dom-selector.js')
      },
    })
  } else if (typeof define == 'function' && define['amd']) {
    define(factory)
  } else {
    global!.NW || (global!.NW = {})
    global!.NW.Dom = factory(global!)
  }
})(this, function Factory(global: EngineGlobal) {
  var version = 'nwsapi-2.3.0-prerelease',
    primordials = (Factory as typeof Factory & { _primordials: Primordials })[
      '_primordials'
    ],
    doc = global.document,
    root = doc.documentElement,
    // Factory fallback for documents without a window.
    ELEMENT_PROTO = global.Element && global.Element.prototype,
    sliceCall = primordials.ArrayPrototypeSlice,
    CFG = {
      // extensions
      operators: '[~*^$|]=|=',
      combinators: '[\\x20\\t>+~](?=[^>+~])',
    },
    // Literal patterns share immutable source data while each engine owns
    // its regexp objects and their mutable lastIndex values.
    REX = {
      HasEscapes: /\\/,
      HexNumbers: /^[0-9a-fA-F]/,
      EscOrQuote: /^\\|[\x22\x27]/,
      RegExpChar: /(?!\\)[\\^$.,*+?()[\]{}|\/]/g,
      TrimSpaces: /^[\x20\t\r\n\f]+|[\x20\t\r\n\f]+$/g,
      SplitGroup: /(\([^)]*\)|\[[^[]*\]|\\.|[^,])+/g,
      CommaGroup: /(\s*,\s*)(?![^\x5b]*\x5d)(?![^\x28]*\x29)/g,
      FixEscapes: /\\([0-9a-fA-F]{1,6}[\x20\t\r\n\f]?|.)|([\x22\x27])/g,
      CombineWSP:
        /\\[0-9a-fA-F]{1,6}(?:\r\n|[\t\n\r\f\x20])?|[\n\r\f\x20]+(?=(?:[^']*['][^']*['])*[^']*$)(?=(?:[^"]*["][^"]*["])*[^"]*$)/g,
      TabCharWSP:
        /(\x20?\t+\x20?)(?=(?:[^']*['][^']*['])*[^']*$)(?=(?:[^"]*["][^"]*["])*[^"]*$)/g,
      LogicalPfx: /^:(is|where|matches|not|has)\x28/i,
    },
    STD = {
      apimethods: /^(?:\w+|\*)\|/,
    },
    Patterns: Record<string, RegExp> & {
      id?: RegExp
      tagName?: RegExp
      className?: RegExp
      attribute?: RegExp
    } = {
      treestruct: /^:(nth(?:-last)?(?:-child|-of-type))\(/i,
      structural:
        /^:(?:(scope|root|empty|(?:(?:first|last|only)(?:-child|\-of\-type)))\b)(.*)/i,
      linguistic: /^:(?:(dir)(?:\x28\s?([-\w]{2,})\s?(?:\x29|$)))(.*)/i,
      useraction:
        /^:(?:(hover|active|focus\-within|focus\-visible|focus)\b)(.*)/i,
      inputstate:
        /^:(?:(enabled|disabled|read\-only|read\-write|placeholder\-shown|default|autofill|-webkit\-autofill)\b)(.*)/i,
      inputvalue:
        /^:(?:(checked|indeterminate|required|optional|valid|invalid|in\-range|out\-of\-range)\b)(.*)/i,
      rsrc_state:
        /^:(?:(playing|paused|seeking|buffering|stalled|muted|volume\-locked)\b)(.*)/i,
      disp_state:
        /^:(?:(open|closed|modal|fullscreen|picture\-in\-picture|popover\-open|popover)\b)(.*)/i,
      time_state: /^:(?:(current|past|future)\b)(.*)/i,
      locationpc: /^:(?:(any\-link|link|visited|target|defined)\b)(.*)/i,
      logicalsel:
        /^:(?:(is|where|matches|not|has)(?:\x28\s?([^()]*|.*)\s?(?:\x29|$)))(.*)/i,
      pseudo_sng: /^:(?:(after|before|first\-letter|first\-line)\b)(.*)/i,
      children: /^[\x20\t\r\n\f]?\>[\x20\t\r\n\f]?(.*)/,
      adjacent: /^[\x20\t\r\n\f]?\+[\x20\t\r\n\f]?(.*)/,
      relative: /^[\x20\t\r\n\f]?\~[\x20\t\r\n\f]?(.*)/,
      ancestor: /^[\x20\t\r\n\f]+(.*)/,
      universal: /^(\*)(.*)/,
      namespace: /^(\*|[\w-]+)?\|(.*)/,
    },
    // elements that can carry a hyperlink, see isLink()
    reLinkName = /^(?:a|area)$/i,
    // emulate firefox error strings
    qsNotArgs = 'Not enough arguments',
    qsInvalid = ' is not a valid selector',
    // detect structural pseudo-classes in selectors
    reNthElem = /(:nth(?:-last)?-child)/i,
    reNthType = /(:nth(?:-last)?-of-type)/i,
    // placeholder for global regexp
    reOptimizer: RegExp,
    reSimpleId: RegExp,
    reValidator: RegExp,
    // special handling configuration flags
    Config: {
      IDS_DUPES: boolean
      FORGIVING: boolean
      LEGACY: boolean
      NODE_LIST: boolean
      LOGERRORS: boolean
      USR_EVENT: boolean
      VERBOSITY: boolean
      [key: string]: boolean
    } = {
      IDS_DUPES: true,
      FORGIVING: true,
      LEGACY: false,
      NODE_LIST: false,
      LOGERRORS: true,
      USR_EVENT: true,
      VERBOSITY: true,
    },
    legacyHooks: LegacyHooks | undefined,
    // Capture the constructor on first use. The optional hooks can supply an
    // allocator for a host without WeakMap before any cache is requested.
    createWeakMap = function <Key extends WeakKey, Value>():
      | WeakMap<Key, Value>
      | undefined {
      var Constructor = primordials.WeakMapCtor!
      createWeakMap = function () {
        return new Constructor()
      }
      return createWeakMap<Key, Value>()
    },
    NAMESPACE: string | null,
    QUIRKS_MODE: boolean,
    HTML_DOCUMENT: boolean,
    ATTR_STD_OPS: Record<string, number> = {
      '=': 1,
      '^=': 1,
      '$=': 1,
      '|=': 1,
      '*=': 1,
      '~=': 1,
    },
    HTML_TABLE: Record<string, number> = {
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
    Combinators: Record<string, (match: RegExpMatchArray) => string> = {},
    Selectors: Record<string, SelectorExtension> = {},
    Operators: Record<string, AttributeOperator> = {
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
    concatCall = function (
      nodes: ArrayLike<Element>,
      callback: (element: Element) => unknown,
    ) {
      var i = 0,
        l = nodes.length,
        list = Array<Element>(l)
      while (l > i) {
        if (false === callback((list[i] = nodes[i]!))) {
          list.length = i + 1
          break
        }
        ++i
      }
      return list
    },
    concatList = function (list: Element[], nodes: ArrayLike<Element>) {
      var i = -1,
        l = nodes.length
      while (l--) {
        list[list.length] = nodes[++i]!
      }
      return list
    },
    // caching limit for compiled resolver functions
    CACHE_LIMIT = 4096,
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
    createCache = function <Value>(limit?: number): PlanCache<Value> {
      var young: Map<string, Value> | undefined,
        old: Map<string, Value> | undefined,
        half: number

      limit || (limit = CACHE_LIMIT)
      half = limit > 1 ? limit >> 1 : 1

      return {
        clear: function () {
          young = undefined
          old = undefined
        },
        get: function (key: string) {
          if (!young) {
            return undefined
          }
          var value = young.get(key)
          if (value !== undefined) {
            return value
          }
          if (!old) {
            return undefined
          }
          value = old.get(key)
          if (value !== undefined) {
            // second chance: carry it across before the old generation goes
            old.delete(key)
            if (young.size >= half) {
              old = young
              young = new primordials.MapCtor!<string, Value>()
            }
            young.set(key, value)
          }
          return value
        },
        set: function (key: string, value: Value) {
          if (!young || young.size >= half) {
            old = young
            young = new primordials.MapCtor!<string, Value>()
          }
          young.set(key, value)
          return value
        },
        size: function () {
          return (young ? young.size : 0) + (old ? old.size : 0)
        },
      }
    },
    // Static NodeList-compatible snapshots for installed DOM methods and the
    // opt-in NODE_LIST API. Define methods on the snapshot because native
    // prototype methods require a browser-owned internal NodeList object.
    toNodeList = function (
      nodeArray: Element[] | NodeListOf<Element>,
    ): Element[] | NodeListOf<Element> {
      if (!global.NodeList || isInstanceOf(nodeArray)) {
        return nodeArray
      }
      var list = primordials.ObjectCreate(global.NodeList.prototype),
        i
      primordials.ObjectDefineProperties(list, {
        length: { value: nodeArray.length },
        item: {
          value: function (index: number) {
            if (!arguments.length) {
              throw new TypeError(qsNotArgs)
            }
            return nodeArray[index >>> 0] || null
          },
        },
        forEach: {
          value: function (
            callback: (
              this: unknown,
              value: Element,
              index: number,
              list: NodeListOf<Element>,
            ) => void,
            receiver: unknown,
          ) {
            if (typeof callback != 'function') {
              throw new TypeError('callback must be a function')
            }
            for (var j = 0; j < nodeArray.length; ++j) {
              callback.call(receiver, nodeArray[j]!, j, list)
            }
          },
        },
      })
      for (i = 0; i < nodeArray.length; ++i) {
        primordials.ObjectDefineProperty(list, i, {
          value: nodeArray[i],
          enumerable: true,
        })
      }
      if (primordials.SymbolIterator) {
        var iterator = function (kind: number) {
          var index = 0,
            result: {
              next: () => IteratorResult<Element | number | [number, Element]>
              [Symbol.iterator]?: () => typeof result
            } = {
              next: function () {
                if (index >= nodeArray.length) {
                  return { value: undefined, done: true }
                }
                var current = index++
                return {
                  value:
                    kind == 1
                      ? current
                      : kind == 2
                        ? ([current, nodeArray[current]!] as [number, Element])
                        : nodeArray[current]!,
                  done: false,
                }
              },
            }
          result[primordials.SymbolIterator!] = function () {
            return this
          }
          return result
        }
        primordials.ObjectDefineProperties(list, {
          values: {
            value: function () {
              return iterator(0)
            },
          },
          keys: {
            value: function () {
              return iterator(1)
            },
          },
          entries: {
            value: function () {
              return iterator(2)
            },
          },
        })
        primordials.ObjectDefineProperty(list, primordials.SymbolIterator, {
          value: list.values,
        })
      }
      return list
    },
    isInstanceOf = function (nodes: unknown): nodes is NodeListOf<Element> {
      return !!global.NodeList && nodes instanceof global.NodeList
    },
    documentOrder = function (a: Element, b: Element) {
      if (!hasDupes && a === b) {
        hasDupes = true
        return 0
      }
      return a.compareDocumentPosition(b) & 4 ? -1 : 1
    },
    hasDupes = false,
    unique = function (nodes: Element[]) {
      var i = 0,
        j = -1,
        l = nodes.length + 1,
        list = []
      while (--l) {
        if (nodes[i++] === nodes[i]) {
          continue
        }
        list[++j] = nodes[i - 1]!
      }
      hasDupes = false
      return list
    },
    switchContext = function (
      context: EngineContext,
      force?: boolean | undefined,
    ) {
      var oldDoc = doc
      partCounts.clear()
      typeRoutes.clear()
      doc = (context.ownerDocument || context) as Document
      if (force || oldDoc !== doc) {
        // force a new check for each document change
        // performed before the next select operation
        root = doc.documentElement
        // Compiled case and namespace checks belong to this document.
        matchLambdas.clear()
        selectLambdas.clear()
        matchResolvers.clear()
        selectResolvers.clear()
        firstResolvers.clear()
        if (legacyHooks && !Config.LEGACY && legacyHooks.detect(doc)) {
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
    codePointToUTF16 = function (codePoint: number) {
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
    stringFromCodePoint = function (codePoint: number) {
      // out of range, use replacement character
      if (
        codePoint < 1 ||
        codePoint > 0x10ffff ||
        (codePoint > 0xd7ff && codePoint < 0xe000)
      ) {
        return '\ufffd'
      }
      if (codePoint < 0x10000) {
        return primordials.StringFromCharCode(codePoint)
      }
      if (primordials.StringFromCodePoint) {
        return primordials.StringFromCodePoint(codePoint)
      }
      return primordials.StringFromCharCode(
        ((codePoint - 0x10000) >> 0x0a) + 0xd800,
        ((codePoint - 0x10000) % 0x400) + 0xdc00,
      )
    },
    // convert escape sequence in a CSS string or identifier
    // to javascript string with javascript escape sequences
    escapeIdentifier = function (str: string) {
      return REX.HasEscapes.test(str)
        ? str.replace(
            REX.FixEscapes,
            function (substring, p1: string, p2: string) {
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
            },
          )
        : str
    },
    // convert escape sequence in a CSS string or identifier
    // to javascript string with characters representations
    unescapeIdentifier = function (str: string) {
      return REX.HasEscapes.test(str)
        ? str.replace(REX.FixEscapes, function (substring, p1: string, p2) {
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
    splitList = function (text: string) {
      var chr,
        depth = 0,
        escaped,
        i = 0,
        l = text.length,
        quote = 0,
        start = 0,
        list = []

      for (; l > i; ++i) {
        chr = text.charCodeAt(i)
        if (escaped) {
          escaped = false
          continue
        }
        if (chr == 92 /* '\\' */) {
          escaped = true
        } else if (quote) {
          if (chr == quote) {
            quote = 0
          }
        } else if (chr == 34 /* '"' */ || chr == 39 /* "'" */) {
          quote = chr
        } else if (chr == 40 /* '(' */ || chr == 91 /* '[' */) {
          ++depth
        } else if (chr == 41 /* ')' */ || chr == 93 /* ']' */) {
          --depth
        } else if (chr == 44 /* ',' */ && depth === 0) {
          list[list.length] = text.slice(start, i).replace(REX.TrimSpaces, '')
          start = i + 1
        }
      }
      list[list.length] = text.slice(start).replace(REX.TrimSpaces, '')
      return list
    },
    matchLogical = function (
      selector: string,
      prefix?: RegExp,
    ): [string, string, string, string] | null {
      var chr,
        close,
        escaped,
        depth = 1,
        i,
        l,
        quote = 0,
        match = selector.match(prefix || REX.LogicalPfx)

      if (!match) {
        return null
      }

      for (i = match[0].length, l = selector.length; l > i; ++i) {
        chr = selector.charCodeAt(i)
        if (escaped) {
          escaped = false
          continue
        }
        if (chr == 92 /* '\\' */) {
          escaped = true
        } else if (quote) {
          if (chr == quote) {
            quote = 0
          }
        } else if (chr == 34 /* '"' */ || chr == 39 /* "'" */) {
          quote = chr
        } else if (chr == 40 /* '(' */) {
          ++depth
        } else if (chr == 41 /* ')' */ && --depth === 0) {
          break
        }
      }

      // i is the closing parenthesis, or the EOF that stands in for it
      close = l > i ? i + 1 : i

      return [
        selector.slice(0, close),
        match[1]!,
        selector.slice(match[0].length, i).replace(REX.TrimSpaces, ''),
        selector.slice(close),
      ]
    },
    matchNth = function (selector: string) {
      var match = matchLogical(selector, Patterns['treestruct']),
        parts
      if (!match) {
        return null
      }
      parts =
        /^(even|odd|[+-]?(?:\d*n(?:[\t\n\f\r ]*[+-][\t\n\f\r ]*\d+)?|\d+))(?:[\t\n\f\r ]+of(?![-\w\u0080-\uFFFF\\])[\t\n\f\r ]*([\s\S]+))?$/i.exec(
          match[2],
        )
      if (!parts) {
        emit("'" + selector + "'" + qsInvalid)
        return null
      }
      return [
        match[0],
        match[1],
        parts[1]!.toLowerCase().replace(/[\t\n\f\r ]/g, ''),
        parts[2]!,
        match[3],
      ] as RegExpMatchArray
    },
    normalizeCombinators = function (text: string) {
      if (!/[>+~]/.test(text)) {
        return text
      }
      var result = '',
        depth = 0,
        quote = '',
        i = 0,
        char
      for (; i < text.length; ++i) {
        char = text.charAt(i)
        if (char == '\\') {
          result += char + text.charAt(++i)
          continue
        }
        if (quote) {
          if (char == quote) {
            quote = ''
          }
        } else if (char == '"' || char == "'") {
          quote = char
        } else if (char == '(' || char == '[') {
          ++depth
        } else if (char == ')' || char == ']') {
          --depth
        } else if (!depth && (char == '>' || char == '+' || char == '~')) {
          result = result.replace(/[\t\n\f\r ]+$/, '')
          while (
            /[\t\n\f\r ]/.test(text.charAt(i + 1)) &&
            i + 1 < text.length
          ) {
            ++i
          }
        }
        result += char
      }
      return result
    },
    method = {
      '#': 'getElementById',
      '*': 'getElementsByTagName',
      '|': 'getElementsByTagNameNS',
      '.': 'getElementsByClassName',
    } as const,
    // Fetch candidates directly for both new and cached query plans.
    fetch: Record<
      string,
      (name: string, context: EngineContext) => Element[] | NodeListOf<Element>
    > = {
      '#': (n, c) => byId(n, c),
      '*': (n, c) => byTag(n, c),
      '|': (n, c) => byTagNS(c, n),
      '.': (n: string, c) => (/[\t\n\f\r ]/.test(n) ? [] : byClass(n, c)),
      '?': (n, c) => byTags(n, c),
    },
    // find duplicate ids using iterative walk
    // Walk 'context' in tree order collecting elements carrying 'id'. The
    // walk can start at 'from', an element already known to be the first match.
    byIdRaw = function (
      id: string,
      context: EngineContext,
      from?: Element,
    ): Element[] {
      var node: EngineContext | null = context,
        nodes: Element[] = [],
        next

      if (Config.LEGACY) {
        return legacyHooks!.byIdRaw(id, context, from)
      }

      next = from || node.firstElementChild
      while ((node = next)) {
        ;(node as Element).id == id && (nodes[nodes.length] = node as Element)
        if (
          (next =
            node.firstElementChild || (node as Element).nextElementSibling)
        ) {
          continue
        }
        while (!next && (node = node.parentElement) && node !== context) {
          next = (node as Element).nextElementSibling
        }
      }
      return nodes
    },
    // context agnostic getElementById
    byId = function (id: string, context: EngineContext): Element[] {
      var e,
        i,
        l,
        nodes,
        lookupRoot,
        api = method['#']

      // duplicates id allowed
      if (Config.IDS_DUPES === false) {
        if (api in context) {
          return (e = context[api]!(id)) ? [e] : none
        }
      } else {
        if ('all' in context) {
          if (
            (e = (
              context.all as HTMLAllCollection &
                Record<string, Element | HTMLCollectionOf<Element> | number>
            )[id])
          ) {
            if ((e as Element).nodeType == 1) {
              return attrOf(e as Element, 'id') != id ? [] : [e as Element]
            } else if (id == 'length') {
              return (e = context[api]!(id)) ? [e] : none
            }
            for (
              i = 0, l = (e as HTMLCollectionOf<Element>).length, nodes = [];
              l > i;
              ++i
            ) {
              if (
                (e as ArrayLike<Element>)[i]! &&
                (e as ArrayLike<Element>)[i]!.nodeType == 1 &&
                idOf((e as ArrayLike<Element>)[i]!) == id
              ) {
                nodes[nodes.length] = (e as ArrayLike<Element>)[i]!
              }
            }
            return nodes
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
      // A connected element may belong to a shadow tree. Only its actual
      // document root can prove absence through the document's ID map.
      lookupRoot =
        context.nodeType == 9
          ? context
          : context.getRootNode
            ? context.getRootNode()
            : null
      if (lookupRoot && lookupRoot.nodeType == 9) {
        e = (lookupRoot as Document).getElementById(id)
        if (!e) {
          return none
        }
        if (context.nodeType == 9) {
          return byIdRaw(id, context, e)
        }
      }

      return byIdRaw(id, context)
    },
    // wrapped up namespaced TagName api calls
    byTagNS = function (context: EngineContext, tag: string): Element[] {
      if (context.getElementsByTagNameNS) {
        return collectionCopy(context.getElementsByTagNameNS('*', tag), context)
      }
      // Fragments and older hosts may have no namespace lookup. A qualified
      // name lookup can omit prefixed elements, so filter the complete walk.
      var candidates = byTag('*', context),
        nodes = [],
        i
      for (i = 0; i < candidates.length; ++i) {
        if (tag == '*' || tagOf(candidates[i]!) == tag) {
          nodes[nodes.length] = candidates[i]!
        }
      }
      return nodes
    },
    // context agnostic getElementsByTagName
    // Narrow logical type lists only when they cover a minority of the tree.
    typeRoutes = createCache<{ broad: boolean; remaining: number }>(),
    byTags = function (names: string, context: EngineContext) {
      if (
        Config.LEGACY ||
        !HTML_DOCUMENT ||
        !context.getElementsByTagName ||
        hasForeignTypes(context)
      ) {
        return byTag('*', context)
      }
      var route = typeRoutes.get(names)
      if (route && --route.remaining > 0 && route.broad) {
        return byTag('*', context)
      }
      var probe = !route || route.remaining <= 0,
        tags = names.split(','),
        seen = primordials.ObjectCreate(null),
        collections = [],
        count = 0,
        nodes: Element[] = [],
        list,
        merged,
        left,
        right,
        i,
        tag
      for (i = 0; i < tags.length; ++i) {
        tag = tags[i]!.trim()
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
        list = sliceCall(collections[i]!)
        if (!nodes.length) {
          nodes = list
          continue
        }
        merged = []
        left = right = 0
        // Each lookup is already ordered. Distinct type names are disjoint.
        while (left < nodes.length && right < list.length) {
          merged[merged.length] =
            nodes[left]!.compareDocumentPosition(list[right]!) & 4
              ? nodes[left++]!
              : list[right++]!
        }
        while (left < nodes.length) {
          merged[merged.length] = nodes[left++]!
        }
        while (right < list.length) {
          merged[merged.length] = list[right++]!
        }
        nodes = merged
      }
      return nodes
    },
    collectionRoots: WeakMap<Node, CollectionSnapshotState> | null | undefined =
      null,
    collectionStates:
      | WeakMap<object, CollectionSnapshotState>
      | null
      | undefined = null,
    // Cache candidate collection snapshots, never selector answers. Native
    // collections are expensive to copy through host index getters. A fresh
    // array copy protects the cached candidates from callers and callbacks.
    // takeRecords() invalidates synchronously, before the observer callback.
    collectionSnapshot = function (
      nodes: ArrayLike<Element>,
      context: EngineContext,
      length?: number | undefined,
      small?: boolean | undefined,
    ) {
      var state: CollectionSnapshotState | undefined,
        root,
        view,
        cached,
        i,
        result
      if (collectionStates && (state = collectionStates.get(nodes))) {
        if (state.observer!.takeRecords().length) {
          state.copies = createWeakMap()!
        }
        cached = state.copies.get(nodes)
        if (
          cached &&
          state.document.deref() === (context.ownerDocument || context)
        ) {
          return cached
        }
      }
      length === undefined && (length = nodes.length)
      if (
        (length < 16 && !small) ||
        Config.LEGACY ||
        !primordials.WeakRefCtor ||
        !context.getRootNode
      ) {
        return nodes
      }
      view = ((context.ownerDocument || context) as Document).defaultView
      if (
        !view ||
        !view.MutationObserver ||
        !view.HTMLCollection ||
        !(nodes instanceof view.HTMLCollection)
      ) {
        return nodes
      }
      root = context.getRootNode()
      collectionRoots || (collectionRoots = createWeakMap())
      if (!collectionRoots) {
        return nodes
      }
      state = collectionRoots.get(root)
      if (!state) {
        state = {
          copies: createWeakMap()!,
          observer: null,
          document: new primordials.WeakRefCtor(
            (context.ownerDocument || context) as Document,
          ),
        }
        state.observer = (
          Factory as typeof Factory & {
            _observeCollections<Value>(
              root: Node,
              view: Pick<typeof globalThis, 'MutationObserver'>,
              state: CollectionState<Value>,
            ): MutationObserver
          }
        )['_observeCollections'](root, view, state)
        collectionRoots.set(root, state)
      } else if (
        state.observer!.takeRecords().length ||
        state.document.deref() !== (context.ownerDocument || context)
      ) {
        state.copies = createWeakMap()!
        state.document = new primordials.WeakRefCtor(
          (context.ownerDocument || context) as Document,
        )
      }
      collectionStates || (collectionStates = createWeakMap())
      collectionStates!.set(nodes, state)
      // oxlint-disable-next-line unicorn/no-new-array -- dense native collection
      result = new Array(length)
      for (i = 0; i < length; ++i) {
        result[i] = nodes[i]
      }
      state.copies.set(nodes, result)
      return result
    },
    collectionCopy = function (
      nodes: ArrayLike<Element>,
      context: EngineContext,
    ) {
      var snapshot = Config.LEGACY ? nodes : collectionSnapshot(nodes, context)
      if (snapshot !== nodes) {
        return (snapshot as Element[]).slice()
      }
      var length = nodes.length,
        i,
        // oxlint-disable-next-line unicorn/no-new-array -- dense native collection
        result = new Array(length)
      for (i = 0; i < length; ++i) {
        result[i] = nodes[i]
      }
      return result
    },
    asciiLower = function (name: string) {
      return name.replace(/[A-Z]/g, function (letter: string) {
        return letter.toLowerCase()
      })
    },
    matchesTag = function (element: Element, name: string) {
      var local = tagOf(element)
      if (!local || !HTML_DOCUMENT) {
        return local == name
      }
      name = asciiLower(name)
      return (
        (element.namespaceURI == NAMESPACE ? local : asciiLower(local)) == name
      )
    },
    foreignTypeRoots: WeakMap<Node, ForeignTypeState> | null | undefined = null,
    // Cache only whether native qualified-name lookup is safe. Mutation records
    // invalidate before the next query, including queries in detached trees.
    hasForeignTypes = function (context: EngineContext) {
      if (!HTML_DOCUMENT) {
        return false
      }
      var root = context.getRootNode ? context.getRootNode() : context,
        view =
          ((context.ownerDocument || context) as Document).defaultView ||
          global,
        state: ForeignTypeState | null | undefined,
        node: Element | null,
        foreign = false
      foreignTypeRoots || (foreignTypeRoots = createWeakMap())
      state = foreignTypeRoots && foreignTypeRoots.get(root)
      if (state && !state.dirty && !state.observer!.takeRecords().length) {
        return state.foreign
      }
      node =
        root.nodeType == 1
          ? (root as Element)
          : (root as Document).firstElementChild
      while (node) {
        if (
          node.namespaceURI != NAMESPACE ||
          node.prefix ||
          /[A-Z]/.test(node.localName)
        ) {
          foreign = true
          break
        }
        if (node.firstElementChild) {
          node = node.firstElementChild
        } else {
          while (node && node !== root && !node.nextElementSibling) {
            node = node.parentElement
          }
          node = node && node !== root ? node.nextElementSibling : null
        }
      }
      if (
        !state &&
        foreignTypeRoots &&
        view.MutationObserver &&
        primordials.WeakRefCtor &&
        !Config.LEGACY
      ) {
        state = {
          observer: null,
          foreign: foreign,
          dirty: false,
        }
        state.observer = (
          Factory as typeof Factory & {
            _observeCollections(
              root: Node,
              view: Pick<typeof globalThis, 'MutationObserver'>,
              state: ForeignTypeState,
            ): MutationObserver
          }
        )['_observeCollections'](root, view, state)
        foreignTypeRoots.set(root, state)
      } else if (state) {
        state.foreign = foreign
        state.dirty = false
        state.observer!.takeRecords()
      }
      return foreign
    },
    byTag = function (
      tag: string,
      context: EngineContext,
    ): Element[] | NodeListOf<Element> {
      if (tag != '*' && hasForeignTypes(context)) {
        var all = byTag('*', context),
          matched = []
        for (var index = 0; index < all.length; ++index) {
          if (matchesTag(all[index]!, tag)) {
            matched[matched.length] = all[index]!
          }
        }
        return Config.NODE_LIST ? toNodeList(matched) : matched
      }
      if (!HTML_DOCUMENT && tag != '*') {
        return byTagNS(context, tag)
      }
      var e,
        nodes,
        api = method['*']
      // Legacy hooks filter non-element nodes returned by older hosts.
      if (Config.LEGACY) {
        nodes = legacyHooks!.byTag(tag, context)
      } else if (api in context) {
        return collectionCopy(context[api]!(tag), context)
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
    byClass = function (cls: string, context: EngineContext) {
      var e,
        nodes,
        api = method['.'],
        reCls
      if (Config.LEGACY) {
        nodes = legacyHooks!.byClass(cls, context)
      } else if (api in context) {
        return collectionCopy(context[api]!(cls), context)
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
    attributeValueNS = function (e: Element, name: string) {
      if (e.getAttributeNS) {
        return e.getAttributeNS(null, name)
      }
      var attribute = e.getAttributeNode && e.getAttributeNode(name)
      return attribute && attribute.namespaceURI ? null : attrOf(e, name)
    },
    // namespace aware hasAttribute
    // helper for XML/XHTML documents
    hasAttributeNS = function (
      e: Element,
      name: string,
      pattern?: RegExp,
      expected?: boolean,
    ) {
      var i,
        l,
        local,
        attribute,
        attr = attrNamesOf(e)
      if (HTML_DOCUMENT) {
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
          (HTML_DOCUMENT ? local.toLowerCase() : local) == name &&
          (!pattern || pattern.test(attrOf(e, attr[i]!)!) === expected)
        ) {
          return true
        }
      }
      return false
    },
    includes: LegacyReaders['includes'] = primordials.StringPrototypeIncludes!,
    attrOf: LegacyReaders['attrOf'] = function (e, name) {
      return e.getAttribute(name)
    },
    hasAttrOf: LegacyReaders['hasAttrOf'] = function (e, name) {
      return e.hasAttribute(name)
    },
    tagOf: LegacyReaders['tagOf'] = function (e) {
      return e.localName
    },
    idOf: LegacyReaders['idOf'] = function (e) {
      return e.id
    },
    upOf: LegacyReaders['upOf'] = function (e) {
      return e.parentElement
    },
    nextOf: LegacyReaders['nextOf'] = function (e) {
      return e.nextElementSibling
    },
    _prevOf: LegacyReaders['prevOf'] = function (e) {
      return e.previousElementSibling
    },
    firstOf: LegacyReaders['firstOf'] = function (e) {
      return e.firstElementChild
    },
    attrNamesOf: LegacyReaders['attrNamesOf'] = function (e) {
      return e.getAttributeNames()
    },
    connectedOf: LegacyReaders['connectedOf'] = function (e) {
      return e.isConnected
    },
    modernReaders: LegacyReaders = {
      includes: includes,
      attrOf: attrOf,
      hasAttrOf: hasAttrOf,
      tagOf: tagOf,
      idOf: idOf,
      legacyClassOf: function (e) {
        return classOf(e) || ''
      },
      upOf: upOf,
      nextOf: nextOf,
      prevOf: _prevOf,
      firstOf: firstOf,
      attrNamesOf: attrNamesOf,
      connectedOf: connectedOf,
    },
    useLegacy = function (on: boolean) {
      var readers = on ? legacyHooks! : modernReaders,
        name
      if (on) {
        legacyHooks!.initialize(doc)
      }
      includes = readers.includes
      attrOf = readers.attrOf
      hasAttrOf = readers.hasAttrOf
      tagOf = readers.tagOf
      idOf = readers.idOf
      upOf = readers.upOf
      nextOf = readers.nextOf
      _prevOf = readers.prevOf
      firstOf = readers.firstOf
      attrNamesOf = readers.attrNamesOf
      connectedOf = readers.connectedOf
      for (name in modernReaders) {
        ;(Snapshot as unknown as Record<string, unknown>)[name] = (
          readers as unknown as Record<string, unknown>
        )[name]
      }
    },
    classOf = function (e: Element) {
      var value = e.className as string | SVGAnimatedString
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
    readDirect = {
      tag: function (v: string) {
        return v + '.localName'
      },
      id: function (v: string) {
        return v + '.id'
      },
      cls: function (v: string) {
        return 's.classOf(' + v + ')'
      },
      up: function (v: string) {
        return v + '.parentElement'
      },
      next: function (v: string) {
        return v + '.nextElementSibling'
      },
      prev: function (v: string) {
        return v + '.previousElementSibling'
      },
      attr: function (v: string, name: string) {
        return v + '.getAttribute("' + name + '")'
      },
      has: function (v: string, name: string) {
        return v + '.hasAttribute("' + name + '")'
      },
    },
    readGuarded = {
      tag: readDirect.tag,
      id: readDirect.id,
      cls: readDirect.cls,
      up: readDirect.up,
      next: readDirect.next,
      prev: readDirect.prev,
      attr: function (v: string, name: string) {
        return v + '.getAttribute&&' + v + '.getAttribute("' + name + '")'
      },
      has: function (v: string, name: string) {
        return v + '.hasAttribute&&' + v + '.hasAttribute("' + name + '")'
      },
    },
    // fast resolver for the :nth-child() and :nth-last-child() pseudo-classes
    nthElement = (function () {
      var idx = 0,
        len = 0,
        set = 0,
        parent: ParentNode | null | undefined = undefined,
        parents = Array<ParentNode | null>(),
        nodes = Array<Element[]>()
      return function (element: Element | null, dir: number) {
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
        var e: Element | Element[] | null,
          i,
          j,
          k,
          l,
          p = Config.LEGACY ? upOf(element!) : element!.parentNode
        if (parent === p) {
          i = set
          j = idx
          l = len
        } else {
          l = parents.length
          parent = p
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
            nodes[i] = Array<Element>()
            e = parent ? firstOf(parent) || element : element
            if (Config.LEGACY) {
              var siblings = legacyHooks!.siblings(
                e as Element | null,
                element!,
              )
              nodes[i] = siblings.nodes
              j = siblings.index
              l = siblings.nodes.length
            } else {
              while (e) {
                nodes[i]![l] = e as Element
                if (e === element) {
                  j = l
                }
                e = (e as Element).nextElementSibling
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
            l = nodes[i]!.length
            set = i
          }
        }
        if (element !== nodes[i]![j] && element !== nodes[i]![(j = 0)]) {
          for (j = 0, e = nodes[i]!, k = l - 1; l > j; ++j, --k) {
            if ((e as Element[])[j] === element) {
              break
            }
            if ((e as Element[])[k] === element) {
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
    // A filtered position belongs to one resolver invocation. Index each
    // parent's matching siblings once, and release the index on return or
    // exception. Callbacks use fresh state because they can change the tree.
    nthFiltered = function (
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
      if (!siblings) {
        siblings = { nodes: [], positions: createWeakMap() }
        resolvers = matchResolvers.get('false:' + selector)
        if (!resolvers) {
          resolvers = match_collect(
            parse(selector, false) as string[],
            undefined,
          )
          matchResolvers.set('false:' + selector, resolvers)
        }
        child = element.parentNode ? firstOf(parent) : element
        while (child) {
          if (match_assert(resolvers, child, undefined)) {
            siblings.nodes[siblings.nodes.length] = child
            siblings.positions &&
              siblings.positions.set(child, siblings.nodes.length)
          }
          child = nextOf(child)
        }
        if (state) {
          state.parents || (state.parents = createWeakMap())
          state.parents && state.parents.set(parent, siblings)
        }
      }
      if (state) {
        state.parent = parent
        state.siblings = siblings
      }
      index = siblings.positions
        ? siblings.positions.get(element) || 0
        : siblings.nodes.indexOf(element) + 1
      return index && reverse ? siblings.nodes.length - index + 1 : index
    },
    // fast resolver for the :nth-of-type() and :nth-last-of-type() pseudo-classes
    nthOfType = (function () {
      var idx = 0,
        len = 0,
        set = 0,
        current: Element[] | undefined,
        parent: ParentNode | null | undefined = undefined,
        parents = Array<ParentNode | null>(),
        nodes = Array<Record<string, Element[]>>()
      return function (element: Element | null, dir: number, stable?: boolean) {
        // ensure caches are emptied after each run, invoking with dir = 2
        if (dir == 2) {
          idx = 0
          len = 0
          set = 0
          nodes.length = 0
          parents.length = 0
          parent = undefined
          current = undefined
          return -1
        }
        // Adjacent candidates already identify their type and parent. Reuse
        // that identity before paying for three more DOM property reads.
        if (stable && current) {
          if (current[idx] === element) {
            ++idx
            return dir ? len - idx + 1 : idx
          }
          if (current[idx - 1] === element) {
            return dir ? len - idx + 1 : idx
          }
        }
        current = undefined
        var e: Element | Element[] | null,
          i,
          j,
          k,
          l,
          local = Config.LEGACY ? tagOf(element!) : element!.localName,
          namespace = element!.namespaceURI,
          name =
            namespace == NAMESPACE ? local : (namespace || '') + '\x00' + local
        if (
          nodes[set]! &&
          nodes[set]![name]! &&
          parent === element!.parentNode
        ) {
          i = set
          j = idx
          l = len
        } else {
          l = parents.length
          parent = element!.parentNode
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
          if (i < 0 || !nodes[i]![name]!) {
            parents[(i = l)] = parent
            nodes[i]! || (nodes[i] = primordials.ObjectCreate(null))
            l = 0
            nodes[i]![name] = Array<Element>()
            e = parent ? firstOf(parent) || element : element
            if (Config.LEGACY) {
              var siblings = legacyHooks!.siblings(
                e as Element | null,
                element!,
                local,
                namespace,
              )
              nodes[i]![name] = siblings.nodes
              j = siblings.index
              l = siblings.nodes.length
            } else {
              while (e) {
                if (e === element) {
                  j = l
                }
                if (
                  (e as Element).localName == local &&
                  (e as Element).namespaceURI == namespace
                ) {
                  nodes[i]![name]![l] = e as Element
                  ++l
                }
                e = (e as Element).nextElementSibling
              }
            }
            set = i
            idx = j
            len = l
            if (l < 2) {
              return l
            }
          } else {
            l = nodes[i]![name]!.length
            set = i
          }
        }
        if (
          element !== nodes[i]![name]![j] &&
          element !== nodes[i]![name]![(j = 0)]
        ) {
          for (j = 0, e = nodes[i]![name]!, k = l - 1; l > j; ++j, --k) {
            if ((e as Element[])[j] === element) {
              break
            }
            if ((e as Element[])[k] === element) {
              j = k
              break
            }
          }
        }
        current = nodes[i]![name]
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
    ancestorMasks: WeakMap<Element, number> | null | undefined = null,
    // candidates arrive in document order, so consecutive ones usually share a
    // parent: answering from the last one skips the Map entirely
    lastMaskNode: Element | null = null,
    lastMaskValue = 0,
    tagBits = primordials.ObjectCreate(null),
    tagBit = function (name: string) {
      if (HTML_DOCUMENT) {
        name = asciiLower(name)
      }
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
    ancestorMask = function (node: EngineElement) {
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
        mask = ancestorMasks!.get(parent)
        if (mask !== undefined) {
          break
        }
        chain[chain.length] = parent
        parent = parent.parentElement
      }

      mask = mask === undefined ? 0 : mask | tagBit(parent!.localName)

      // then back down, summarizing each ancestor on the way
      for (i = chain.length - 1; i > -1; --i) {
        ancestorMasks!.set(chain[i]!, mask)
        mask |= tagBit(chain[i]!.localName)
      }

      lastMaskNode = node.parentElement
      lastMaskValue = mask

      return mask
    },
    FILTER_SAMPLE = 64,
    FILTER_KEEP = 48,
    FILTER_RETRY = 4096,
    mayMatch = function (
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
    isHTML = function (node: Node) {
      var doc = (node.ownerDocument || node) as Document
      return doc.nodeType == 9 &&
        // contentType not in IE <= 11
        'contentType' in doc
        ? doc.contentType.indexOf('/html') > 0
        : doc.createElement('DiV').localName == 'div'
    },
    // Native matching exposes custom element state that attributes cannot.
    // https://dom.spec.whatwg.org/#concept-element-defined
    isDefined = function (element: EngineElement) {
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
    isRequired = function (node: EngineElement) {
      return (
        !!node.required &&
        (/^(select|textarea)$/.test(tagOf(node)) ||
          (tagOf(node) == 'input' &&
            !/^(hidden|range|color|button|submit|reset|image)$/.test(
              node.type!,
            )))
      )
    },
    isContentEditable = function (node: EngineElement): boolean {
      // designMode makes every connected element in this document editable,
      // including descendants with contenteditable=false.
      if (
        node.ownerDocument &&
        node.ownerDocument.designMode === 'on' &&
        connectedOf(node)
      ) {
        return true
      }
      var attrValue: string | null = 'inherit'
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
            return isContentEditable(node.parentNode as EngineElement)
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
    isDisabled = function (element: EngineElement) {
      var legend,
        name = tagOf(element),
        node

      if (element.disabled === true) {
        return true
      }

      // Options inherit an immediate optgroup's disabled attribute. Both
      // options and optgroups also participate in fieldset disabledness.
      if (name == 'option') {
        node = upOf(element)
        if (
          node &&
          tagOf(node) == 'optgroup' &&
          (node as EngineElement).disabled === true
        ) {
          return true
        }
      }

      // any disabled fieldset above it, unless it sits in that fieldset's
      // first legend child, which excuses that fieldset and no other
      node = upOf(element)
      while (node) {
        if (
          (node as EngineElement).disabled === true &&
          tagOf(node) == 'fieldset'
        ) {
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
    isFocusable = function (node: EngineElement) {
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
    // use the native selector state when it is available; when NWSAPI has
    // installed itself, _matches retains the native implementation
    matchesNative = function (
      node: EngineElement,
      selector: string,
      unavailable?: boolean | undefined,
    ) {
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
          primordials.ObjectPrototypeHasOwnProperty(node, 'matches')) &&
          node.matches) ||
        (ELEMENT_PROTO && ELEMENT_PROTO.matches)
      if (!matcher && Config.LEGACY) {
        if (matcherRecord!.fallback === null) {
          view = ownerDoc.defaultView
          proto = view && view.Element && view.Element.prototype
          matcherRecord!.fallback =
            legacyHooks!.matcher(proto) ||
            (proto !== ELEMENT_PROTO
              ? legacyHooks!.matcher(ELEMENT_PROTO)
              : undefined)
        }
        matcher = matcherRecord!.fallback
      }
      if (matcher !== matcherRecord!.matcher) {
        matcherRecord!.matcher = matcher
        matcherRecord!.delegates = false
      }
      if (!matcher || matcherRecord!.delegates) {
        return unavailable
      }
      try {
        matchingNative = matcherRecord!
        var result = matcher.call(node, selector)
        return matchingNative!.delegates ? unavailable : result
      } catch (e) {
        return unavailable
      } finally {
        matchingNative = null
      }
    },
    // The active record is marked directly on re-entry, even if the host throws.
    matchingNative: { delegates: boolean } | null = null,
    // Consecutive queries avoid a WeakMap lookup. Retain other documents weakly
    // so switching realms does not repeat delegation detection. Allocate after
    // legacy configuration, on first use; undefined selects the bounded fallback.
    matcherDoc: Document | null = null,
    matcherRecord: NativeMatcherRecord | null | undefined = null,
    matcherCache: WeakMap<Document, NativeMatcherRecord> | null | undefined =
      null,
    // :open and :closed have a portable DOM state for details and dialog.
    // Native matching extends support to host-language states such as pickers.
    isOpen = function (node: EngineElement) {
      return (
        (/^(details|dialog)$/i.test(tagOf(node)) && node.open === true) ||
        matchesNative(node, ':open')
      )
    },
    isClosed = function (node: EngineElement) {
      return (
        (/^(details|dialog)$/i.test(tagOf(node)) && node.open === false) ||
        matchesNative(node, ':closed')
      )
    },
    isFullscreen = function (node: EngineElement) {
      var doc = node.ownerDocument
      return (
        matchesNative(node, ':fullscreen') ||
        !!(
          doc &&
          (doc.fullscreenElement === node ||
            (doc as Document & { webkitFullscreenElement?: Element })
              .webkitFullscreenElement === node ||
            (doc as Document & { mozFullScreenElement?: Element })
              .mozFullScreenElement === node ||
            (doc as Document & { msFullscreenElement?: Element })
              .msFullscreenElement === node)
        )
      )
    },
    // A modal dialog cannot be distinguished from dialog.show() without the
    // native :modal state. Fullscreen is explicitly modal per the WPT suite.
    isModal = function (node: EngineElement) {
      return matchesNative(node, ':modal') || isFullscreen(node)
    },
    isPictureInPicture = function (node: EngineElement) {
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
    isPopoverOpen = function (node: EngineElement) {
      return hasAttrOf(node, 'popover') && matchesNative(node, ':popover-open')
    },
    // ':link', ':any-link' and ':visited' share this test
    isLink = function (node: EngineElement) {
      return reLinkName.test(tagOf(node)) && hasAttrOf(node, 'href')
    },
    // Native state covers host-only timing and volume policy. The fallback
    // reads HTML media state without treating a loading pause as user intent.
    isMediaState = function (media: HTMLMediaElement, state: string): boolean {
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
    configure = function (
      option: string | Record<string, unknown>,
      clear?: boolean,
    ) {
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
        if (!legacyHooks && i == 'LEGACY' && option[i]) {
          throw new TypeError(
            'Load modules/nwsapi-legacy.js before enabling LEGACY',
          )
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
        firstResolvers.clear()
      }
      useLegacy(Config.LEGACY)
      setIdentifierSyntax()
      return true
    },
    // centralized error and exceptions handling
    errors = 0,
    emit = function (
      message: string,
      proto?: TypeErrorConstructor | undefined,
    ) {
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
    initialize = function (doc: Document) {
      setIdentifierSyntax()
      lastContext = switchContext(doc, true)
    },
    // build validation regexps used by the engine
    setIdentifierSyntax = function () {
      var syntax = (
        Factory as unknown as {
          _identifierSyntax(
            operators: string,
            combinators: string,
          ): IdentifierSyntax
        }
      )._identifierSyntax(CFG.operators, CFG.combinators)
      reOptimizer = new RegExp(syntax.optimizer)
      reValidator = new RegExp(syntax.validator)
      reSimpleId = new RegExp(syntax.simpleId)
      Patterns.id = new RegExp(syntax.id)
      Patterns.tagName = new RegExp(syntax.tagName)
      Patterns.className = new RegExp(syntax.className)
      Patterns.attribute = new RegExp(syntax.attribute)
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

    // Shared literal backing storage avoids rebuilding flag prefixes on hits.
    compilePrefixes = [
      'selector:false:false:',
      'selector:false:true:',
      'selector:true:false:',
      'selector:true:true:',
      'selector:null:false:',
      'selector:null:true:',
      'relative:false:false:',
      'relative:false:true:',
      'relative:true:false:',
      'relative:true:true:',
      'relative:null:false:',
      'relative:null:true:',
    ],
    F_INIT = '"use strict";return function Resolver(c,f,x,r,v)',
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
    S_VARS: string[] = [],
    M_VARS: string[] = [],
    N_VARS: string[] = [],
    // compile groups or single selector strings into
    // executable functions for matching or selecting
    compile = function (
      selector: string,
      mode: boolean | null,
      callback: boolean | ElementCallback,
      relative?: boolean,
    ): CompiledResolver | null {
      var cacheKey =
        (mode === true || mode === false || mode === null
          ? compilePrefixes[
              (relative ? 6 : 0) +
                (mode === null ? 4 : mode ? 2 : 0) +
                (callback ? 1 : 0)
            ]
          : (relative ? 'relative:' : 'selector:') +
            mode +
            ':' +
            !!callback +
            ':') + selector
      var i,
        mask,
        filter,
        filtered,
        ancestry: CompilerAncestry,
        factory,
        head = '',
        loop = '',
        macro = '',
        source = '',
        vars = ''
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

      // Cache hits need no parser state or helper-alias bookkeeping.
      ancestry = { required: [], pending: [], walk: false }

      source = compileSelector(
        relative && !/^[>+~]/.test(selector) ? ' ' + selector : selector,
        relative ? 'if(e===s.anchor){' + macro + '}' : macro,
        mode,
        callback,
        ancestry,
      )

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
          mask |= tagBit(ancestry.required[i]!)
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

      var clearPositions =
        (reNthElem.test(selector) ? 's.nthElement(null, 2);' : '') +
        (reNthType.test(selector) ? 's.nthOfType(null, 2);' : '')
      if (clearPositions) {
        loop = 'try{' + loop + '}finally{' + clearPositions + '}'
      }

      if (S_VARS[0] || M_VARS[0] || N_VARS[0]) {
        filtered = S_VARS.some(function (name) {
          return name.slice(0, 2) == '_f'
        })
        vars = ',' + (S_VARS.join(',') || M_VARS.join(',') || N_VARS[0])
        S_VARS.length = 0
        M_VARS.length = 0
        N_VARS.length = 0
      }

      if (Config.LEGACY) {
        var rewritten = legacyHooks!.compile(loop)
        loop = rewritten.source
        vars += rewritten.variables
      }

      // oxlint-disable-next-line typescript/no-implied-eval -- Selectors compile to resolver functions.
      factory = Function(
        's',
        'a',
        F_INIT + '{' + head + vars + ';' + loop + 'return r;}',
      )(Snapshot, filter)

      if (filtered) {
        factory.filtered = true
      }

      if (mode || mode === null) {
        selectLambdas.set(cacheKey, factory)
      } else {
        matchLambdas.set(cacheKey, factory)
      }

      return factory
    },
    // build conditional code to check components of selector strings
    isCompound = function (text: string, siblings?: boolean) {
      var chr,
        depth = 0,
        escaped,
        i = 0,
        l = text.length,
        quote = 0

      for (; l > i; ++i) {
        chr = text.charCodeAt(i)
        if (escaped) {
          escaped = false
          continue
        }
        if (chr == 92 /* '\\' */) {
          escaped = true
        } else if (quote) {
          if (chr == quote) {
            quote = 0
          }
        } else if (chr == 34 /* '"' */ || chr == 39 /* "'" */) {
          quote = chr
        } else if (chr == 40 /* '(' */ || chr == 91 /* '[' */) {
          ++depth
        } else if (chr == 41 /* ')' */ || chr == 93 /* ']' */) {
          --depth
        } else if (
          depth === 0 &&
          (chr == 44 /* ',' */ ||
            chr == 62 /* '>' */ ||
            (!siblings && chr == 43) /* '+' */ ||
            (!siblings && chr == 126) /* '~' */ ||
            chr == 32 /* ' ' */ ||
            chr == 9 /* '\t' */ ||
            chr == 10 /* '\n' */ ||
            chr == 12 /* '\f' */ ||
            chr == 13) /* '\r' */
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
    validateLogical = function (argument: string, relative: boolean) {
      var previousErrors = errors,
        selectVars = S_VARS,
        matchVars = M_VARS,
        nodeVars = N_VARS,
        list = splitList(argument),
        parsed,
        i,
        j
      S_VARS = []
      M_VARS = []
      N_VARS = []
      try {
        for (i = 0; i < list.length; ++i) {
          if (!list[i]) {
            emit(qsInvalid)
            return false
          }
          parsed = parse(relative ? '* ' + list[i] : list[i]!, false)
          if (!parsed) {
            return false
          }
          for (j = 0; j < parsed.length; ++j) {
            compileSelector(parsed[j]!, '', relative, false)
          }
        }
        return errors == previousErrors
      } finally {
        S_VARS = selectVars
        M_VARS = matchVars
        N_VARS = nodeVars
      }
    },
    // Check :has() arguments once at compilation. Attribute text and escaped
    // punctuation are data. Invalid items inside forgiving lists are removed
    // individually, so :has(:is(:has(x), p)) still means :has(:is(p)).
    prepareHas = function (text: string) {
      var i = 0,
        quote = 0,
        bracket = 0,
        code,
        logical,
        items,
        kept,
        item,
        j,
        output = '',
        start = 0
      for (; i < text.length; ++i) {
        code = text.charCodeAt(i)
        if (code == 92 /* '\\' */) {
          ++i
          continue
        }
        if (quote) {
          if (code == quote) {
            quote = 0
          }
          continue
        }
        if (code == 34 /* '"' */ || code == 39 /* "'" */) {
          quote = code
          continue
        }
        if (code == 91 /* '[' */) {
          ++bracket
          continue
        }
        if (code == 93 /* ']' */) {
          --bracket
          continue
        }
        if (bracket || code != 58 /* ':' */) {
          continue
        }
        if (
          /^:(?:has\(|:|(?:before|after|first-line|first-letter)(?![-\w]))/i.test(
            text.slice(i),
          )
        ) {
          return null
        }
        if (
          Config.FORGIVING &&
          (logical = matchLogical(text.slice(i), /^:(is|where)\(/i))
        ) {
          items = splitList(logical![2]!)
          kept = []
          for (j = 0; j < items.length; ++j) {
            item = prepareHas(items[j]!)
            if (item !== null) {
              kept.push(item)
            }
          }
          output +=
            text.slice(start, i) +
            ':' +
            logical![1]! +
            '(' +
            (kept.join(',') || ':not(*)') +
            ')'
          i += logical![0]!.length - 1
          start = i + 1
        }
      }
      return output + text.slice(start)
    },
    // Read one pseudo token without treating quoted or nested arguments as tails.
    readPseudo = function (text: string) {
      var double = text.charAt(1) == ':',
        start = double ? 2 : 1,
        identifier = Patterns.tagName!.exec(text.slice(start)),
        end,
        block,
        name
      if (text.charAt(0) != ':' || !identifier) {
        return null
      }
      name = unescapeIdentifier(identifier[1]!).toLowerCase()
      end = start + identifier[1]!.length
      if (text.charAt(end) == '(') {
        // matchLogical owns nested parentheses, strings, and EOF closure.
        block = matchLogical(':x' + text.slice(end), /^:(x)\(/)!
        return {
          name: name,
          double: double,
          argument: block[2],
          rest: block[3],
        }
      }
      return {
        name: name,
        double: double,
        argument: null,
        rest: text.slice(end),
      }
    },
    isIdent = function (text: string, custom?: boolean) {
      var token = Patterns.tagName!.exec(text)
      return (
        !!token &&
        !token[2] &&
        (!custom ||
          !/^(?:initial|inherit|unset|revert|revert-layer|default)$/i.test(
            unescapeIdentifier(text),
          ))
      )
    },
    hasPseudoElement = function (text: string) {
      var quote = '',
        bracket = 0,
        i = 0,
        char,
        pseudo
      for (; i < text.length; ++i) {
        char = text.charAt(i)
        if (char == '\\') {
          ++i
          continue
        }
        if (quote) {
          if (char == quote) {
            quote = ''
          }
          continue
        }
        if (char == '"' || char == "'") {
          quote = char
          continue
        }
        if (char == '[') {
          ++bracket
          continue
        }
        if (char == ']') {
          --bracket
          continue
        }
        if (bracket || char != ':') {
          continue
        }
        pseudo = readPseudo(text.slice(i))
        if (!pseudo) {
          continue
        }
        if (
          (pseudo.double && !isPseudoExtension(text.slice(i))) ||
          /^(?:before|after|first-line|first-letter)$/.test(pseudo.name)
        ) {
          return true
        }
        if (pseudo.name == 'is' || pseudo.name == 'where') {
          i = text.length - pseudo.rest.length - 1
        }
      }
      return false
    },
    treePseudo = function (name: string) {
      return /^(?:before|after|marker|placeholder|file-selector-button|details-content|checkmark|picker-icon|picker|backdrop|scroll-marker|scroll-marker-group)$/.test(
        name,
      )
    },
    validPseudoElement = function (name: string, argument: string | null) {
      var pieces
      if (name == 'part') {
        return (
          argument !== null &&
          !!argument &&
          argument.split(/[\t\n\f\r ]+/).every(function (part) {
            return isIdent(part)
          })
        )
      }
      if (name == 'slotted') {
        return (
          argument !== null &&
          isCompound(argument) &&
          !hasPseudoElement(argument) &&
          validateLogical(argument, false)
        )
      }
      if (name == 'highlight') {
        return argument !== null && isIdent(argument, true)
      }
      if (name == 'picker') {
        return (
          argument !== null &&
          unescapeIdentifier(argument).toLowerCase() == 'select'
        )
      }
      if (name == 'scroll-button') {
        return (
          argument !== null &&
          /^(?:\*|up|down|left|right|block-start|block-end|inline-start|inline-end)$/.test(
            unescapeIdentifier(argument).toLowerCase(),
          )
        )
      }
      if (
        /^view-transition-(?:group|image-pair|old|new|group-children)$/.test(
          name,
        )
      ) {
        if (argument === null) {
          return false
        }
        // Dots delimit class identifiers, except when escaped within an identifier.
        pieces = argument.charAt(0) == '*' ? argument.slice(1) : argument
        if (argument.charAt(0) != '*') {
          var first = Patterns.tagName!.exec(pieces)
          if (!first || !isIdent(first[1]!, true)) {
            return false
          }
          pieces = first[2]!
        }
        while (pieces) {
          if (pieces.charAt(0) != '.') {
            return false
          }
          var part = Patterns.tagName!.exec(pieces.slice(1))
          if (!part || !isIdent(part[1]!, true)) {
            return false
          }
          pieces = part[2]!
        }
        return true
      }
      if (name == 'cue' || name == 'cue-region') {
        return (
          argument === null ||
          (isCompound(argument) &&
            !hasPseudoElement(argument) &&
            validateLogical(argument, false))
        )
      }
      return (
        argument === null &&
        (treePseudo(name) ||
          /^(?:first-line|first-letter|selection|target-text|spelling-error|grammar-error|search-text|view-transition|-webkit-[-a-z0-9]{2,})$/.test(
            name,
          ))
      )
    },
    // Registered double-colon extensions retain their compiler dispatch.
    isPseudoExtension = function (text: string): boolean {
      for (var name in Selectors) {
        if (text.search(Selectors[name]!.Expression) == 0) {
          var token = readPseudo(text)
          return (
            !!token &&
            token.double &&
            !validPseudoElement(token.name, token.argument)
          )
        }
      }
      return false
    },
    validPseudoStates = function (text: string, context: string): boolean {
      var token, name, argument, valid
      while (text) {
        token = readPseudo(text)
        if (!token || token.double) {
          return false
        }
        name = token.name
        argument = token.argument
        if (name == 'is' || name == 'where') {
          if (argument === null) {
            return false
          }
          // Invalid branches of forgiving lists do not invalidate the outer selector.
        } else if (name == 'not') {
          if (
            !argument ||
            !splitList(argument).every(function (item) {
              return validPseudoStates(item, context)
            })
          ) {
            return false
          }
        } else {
          if (context == 'part') {
            valid =
              !/^(?:root|scope|empty|host|host-context|has|has-slotted|nth-.+|(?:first|last|only)-(?:child|of-type))$/.test(
                name,
              )
          } else if (context == 'search-text') {
            valid = name == 'current' && argument === null
          } else if (context.indexOf('view-transition-') == 0) {
            valid = name == 'only-child' && argument === null
          } else {
            valid =
              (treePseudo(context) || context == 'scroll-button') &&
              /^(?:hover|active|focus|focus-visible|focus-within)$/.test(name)
            if (
              context == 'scroll-button' &&
              /^(?:enabled|disabled)$/.test(name)
            ) {
              valid = true
            }
          }
          if (
            !valid ||
            !validateLogical(
              text.slice(0, text.length - token.rest.length),
              false,
            )
          ) {
            return false
          }
        }
        text = token.rest
      }
      return true
    },
    validPseudoTail = function (text: string) {
      var token,
        name,
        context = '',
        states = '',
        previous
      while (text) {
        token = readPseudo(text)
        if (!token) {
          return false
        }
        name = token.name
        if (
          token.double ||
          (!context && /^(?:before|after|first-line|first-letter)$/.test(name))
        ) {
          if (states && !validPseudoStates(states, context)) {
            return false
          }
          states = ''
          previous = context
          if (
            previous &&
            !(previous == 'part' && name != 'part' && name != 'slotted') &&
            !(previous == 'slotted' && treePseudo(name)) &&
            !(/^(?:before|after)$/.test(previous) && name == 'marker') &&
            !(previous == 'picker' && treePseudo(name))
          ) {
            return false
          }
          if (!validPseudoElement(name, token.argument)) {
            return false
          }
          context = name
        } else {
          states += text.slice(0, text.length - token.rest.length)
        }
        text = token.rest
      }
      return !states || validPseudoStates(states, context)
    },
    validPseudoSyntax = function (text: string) {
      var quote = '',
        bracket = 0,
        i = 0,
        char,
        token
      for (; i < text.length; ++i) {
        char = text.charAt(i)
        if (char == '\\') {
          ++i
          continue
        }
        if (quote) {
          if (char == quote) {
            quote = ''
          }
          continue
        }
        if (char == '"' || char == "'") {
          quote = char
          continue
        }
        if (char == '[') {
          ++bracket
          continue
        }
        if (char == ']') {
          --bracket
          continue
        }
        if (bracket || char != ':') {
          continue
        }
        token = readPseudo(text.slice(i))
        if (!token) {
          continue
        }
        if (
          (token.double ||
            /^(?:before|after|first-line|first-letter)$/.test(token.name)) &&
          !isPseudoExtension(text.slice(i))
        ) {
          return validPseudoTail(text.slice(i))
        }
        i = text.length - token.rest.length - 1
      }
      return true
    },
    hasHost = function (text: string): boolean {
      var quote = '',
        bracket = 0,
        i = 0,
        char,
        token
      for (; i < text.length; ++i) {
        char = text.charAt(i)
        if (char == '\\') {
          ++i
          continue
        }
        if (quote) {
          if (char == quote) {
            quote = ''
          }
          continue
        }
        if (char == '"' || char == "'") {
          quote = char
          continue
        }
        if (char == '[') {
          ++bracket
          continue
        }
        if (char == ']') {
          --bracket
          continue
        }
        if (bracket || char != ':') {
          continue
        }
        token = readPseudo(text.slice(i))
        if (
          token &&
          !token.double &&
          (/^host(?:-context)?$/.test(token.name) ||
            (token.argument !== null && hasHost(token.argument)))
        ) {
          return true
        }
        if (token) {
          i = text.length - token.rest.length - 1
        }
      }
      return false
    },
    prepareCompound = function (text: string): string | null {
      if (!isCompound(text)) {
        return null
      }
      var quote = '',
        bracket = 0,
        i = 0,
        char,
        token,
        items,
        result = '',
        start = 0
      for (; i < text.length; ++i) {
        char = text.charAt(i)
        if (char == '\\') {
          ++i
          continue
        }
        if (quote) {
          if (char == quote) {
            quote = ''
          }
          continue
        }
        if (char == '"' || char == "'") {
          quote = char
          continue
        }
        if (char == '[') {
          ++bracket
          continue
        }
        if (char == ']') {
          --bracket
          continue
        }
        if (bracket || char != ':') {
          continue
        }
        token = readPseudo(text.slice(i))
        if (
          !token ||
          token.argument === null ||
          !/^(?:not|is|where)$/.test(token.name)
        ) {
          continue
        }
        items = splitList(token.argument).map(prepareCompound)
        if (
          token.name == 'not' &&
          items.some(function (item) {
            return item === null
          })
        ) {
          return null
        }
        result +=
          text.slice(start, i) +
          ':' +
          token.name +
          '(' +
          (items
            .filter(function (item) {
              return item !== null
            })
            .join(',') || ':not(*)') +
          ')'
        i = text.length - token.rest.length - 1
        start = i + 1
      }
      return result + text.slice(start)
    },
    shadowRootOf = function (scope: Node): ShadowRoot | null {
      var root = scope.getRootNode ? scope.getRootNode() : scope
      return root.nodeType == 11 && 'host' in root ? (root as ShadowRoot) : null
    },
    shadowParent = function (element: Element, scope: Node) {
      var root = shadowRootOf(scope)
      if (root && root.host === element) {
        return null
      }
      return (
        element.parentElement ||
        (root && element.parentNode === root ? root.host : null)
      )
    },
    isHost = function (
      element: Element,
      argument: string | null,
      contextual: boolean,
      scope: Node,
    ) {
      var root = shadowRootOf(scope),
        current: Element | null = element
      if (!root || root.host !== element) {
        return false
      }
      if (argument === null) {
        return true
      }
      do {
        if (match(argument, current)) {
          return true
        }
        current = contextual ? upOf(current) : null
      } while (current)
      return false
    },
    hasSlotted = function (element: Element, argument: string | null) {
      if (
        element.namespaceURI != 'http://www.w3.org/1999/xhtml' ||
        element.localName != 'slot'
      ) {
        return false
      }
      var slot = element as HTMLSlotElement
      if (typeof slot.assignedNodes != 'function') {
        return false
      }
      var nodes = slot.assignedNodes({ flatten: true })
      if (argument === null) {
        return nodes.length > 0
      }
      for (var i = 0; i < nodes.length; ++i) {
        if (nodes[i]!.nodeType == 1 && match(argument, nodes[i] as Element)) {
          return true
        }
      }
      return false
    },
    directionality = (
      Factory as typeof Factory & {
        _direction: DirectionHelpers
      }
    )._direction.directionality,
    isDirection = function (element: Element, direction: string) {
      var native = Snapshot.matchesNative(
        element,
        ':dir(' + direction + ')',
        undefined,
      )
      return native === undefined
        ? directionality(element) === direction
        : native
    },
    isLanguage = function (element: Element, range: string) {
      var current: Element | null = element,
        language: string | null = null,
        parts,
        wanted,
        i,
        j
      while (current) {
        language =
          current.getAttributeNS &&
          current.getAttributeNS('http://www.w3.org/XML/1998/namespace', 'lang')
        if (
          language == null &&
          current.namespaceURI == 'http://www.w3.org/1999/xhtml'
        ) {
          language = attrOf(current, 'lang')
        }
        if (language !== null) {
          break
        }
        current = upOf(current)
      }
      if (!language) {
        return range === ''
      }
      if (
        !/^[a-z]{1,8}(?:-[a-z0-9]{1,8})*$/i.test(language) ||
        !/^(?:[a-z]{1,8}|\*)(?:-(?:[a-z0-9]{1,8}|\*))*$/i.test(range)
      ) {
        return false
      }
      parts = language.toLowerCase().split('-')
      wanted = range.toLowerCase().split('-')
      if (wanted[0] != '*' && wanted[0] != parts[0]) {
        return false
      }
      i = 1
      j = 1
      while (i < wanted.length) {
        if (wanted[i] == '*') {
          ++i
          continue
        }
        if (j >= parts.length) {
          return false
        }
        if (wanted[i] == parts[j]) {
          ++i
          ++j
          continue
        }
        if (parts[j]!.length == 1) {
          return false
        }
        ++j
      }
      return true
    },
    // Reject bad closing tokens even inside forgiving selector lists.
    validBlocks = function (text: string) {
      var stack: string[] = [],
        quote = '',
        char,
        i = 0
      for (; i < text.length; ++i) {
        char = text.charAt(i)
        if (char == '\\') {
          ++i
          continue
        }
        if (quote) {
          if (char == quote) {
            quote = ''
          } else if (char == '\n' || char == '\r' || char == '\f') {
            return false
          }
        } else if (char == '"' || char == "'") {
          quote = char
        } else if (char == '(' || char == '[') {
          stack.push(char)
        } else if (char == ')' || char == ']') {
          if (stack.pop() != (char == ')' ? '(' : '[')) {
            return false
          }
        } else if (char == '{' || char == '}') {
          return false
        }
      }
      // CSS closes unterminated strings and blocks at EOF.
      return true
    },
    notFlag = 0,
    compileSelector = function (
      expression: string,
      source: string,
      mode: boolean | null,
      callback: boolean | ElementCallback,
      ancestry?: CompilerAncestry,
    ) {
      var a,
        b,
        n,
        f,
        k = 0,
        previousErrors = errors,
        compat,
        name,
        NS,
        attributeSource,
        attributeGuard,
        attributePattern,
        expr,
        value,
        match: RegExpMatchArray | null | undefined,
        pendingTag = '',
        result,
        status,
        symbol,
        test,
        type,
        selector = expression,
        shadow = expression.indexOf(':') >= 0 && hasHost(expression),
        pseudo,
        vars,
        argument,
        flag,
        nested,
        read: typeof readDirect

      read = Config.LEGACY
        ? legacyHooks!.read
        : mode === false
          ? readGuarded
          : readDirect

      selector = selectorComments(selector)
      // Each compilation owns its requirements. Validation and nested :not()
      // compilation must not contribute tags to the surrounding resolver.
      ancestry = ancestry || { required: [], pending: [], walk: false }

      // isolate selector combinators
      selector = normalizeCombinators(selector)

      // javascript needs a label to break
      // out of the while loops processing
      selector_recursion_label: while (selector) {
        ++k

        // get namespace prefix if present or get first char of selector
        symbol = selector.charCodeAt(0)
        // Only ASCII word or universal prefixes can enter the namespace rule.
        if (
          (symbol == 42 /* '*' */ ||
            symbol == 95 /* '_' */ ||
            (symbol >= 48 /* '0' */ && symbol <= 57) /* '9' */ ||
            (symbol >= 65 /* 'A' */ && symbol <= 90) /* 'Z' */ ||
            (symbol >= 97 /* 'a' */ && symbol <= 122)) /* 'z' */ &&
          STD.apimethods.test(selector)
        ) {
          symbol = 124 /* '|' */
        }

        switch (symbol) {
          // universal resolver
          case 42 /* '*' */:
            match = selector.match(Patterns['universal']!)
            break

          // id resolver
          case 35 /* '#' */:
            match = selector.match(Patterns['id']!)
            // an exact comparison, which is what the selector asks for.
            // escapeIdentifier turns the CSS escapes into JavaScript ones, so
            // only the quote is escaped after it.
            expr = escapeIdentifier(match![1]!).replace(
              /\\.|\x22/g,
              function (part: string) {
                return part == '"' ? '\\"' : part
              },
            )
            source =
              'if((' + read.id('e') + '=="' + expr + '")){' + source + '}'
            break

          // class name resolver
          case 46 /* '.' */:
            match = selector.match(Patterns['className']!)
            match![1] = /[\t\n\f\r ]/.test(unescapeIdentifier(match![1]!))
              ? '(?!)'
              : escapeIdentifier(match![1]!).replace(REX.RegExpChar, '\\$&')
            compat = (QUIRKS_MODE ? 'i' : '') + '.test(' + read.cls('e') + ')'
            source =
              'if((/(^|\\s)' +
              match![1]! +
              '(\\s|$)/' +
              compat +
              ')){' +
              source +
              '}'
            break

          // tag name resolver
          case symbol == 95 /* '_' */ ||
          (symbol >= 65 /* 'A' */ && symbol <= 90) /* 'Z' */ ||
          (symbol >= 97 /* 'a' */ && symbol <= 122) /* 'z' */
            ? symbol
            : undefined:
            match = selector.match(Patterns['tagName']!)
            // the same string the comparison uses, so a filter built from it
            // cannot reject anything this test would have accepted
            expr = unescapeIdentifier(match![1]!)
            ancestry.pending[ancestry.pending.length] = expr
            pendingTag = HTML_DOCUMENT
              ? 'if(' +
                read.tag('e') +
                '==' +
                JSON.stringify(asciiLower(expr)) +
                '||s.matchesTag(e,' +
                JSON.stringify(expr) +
                ')){'
              : 'if((' + read.tag('e') + '==' + JSON.stringify(expr) + ')){'
            break

          // namespace resolver
          case 124 /* '|' */:
            match = selector.match(Patterns['namespace']!)
            if (match![1] == '*') {
              source = 'if(true){' + source + '}'
            } else if (!match![1]!) {
              source = 'if((!e.namespaceURI)){' + source + '}'
            } else {
              // DOM selector APIs have no namespace-prefix resolver. An XML
              // xmlns declaration does not declare a CSS selector prefix.
              emit("'" + expression + "'" + qsInvalid)
            }
            break

          // attributes resolver
          case 91 /* '[' */:
            match = selector.match(Patterns['attribute']!)
            if (!match) {
              break
            }
            NS = /^\[[\t\n\f\r ]*\*\|/.test(match[0])
            name = match![1]!
            expr = unescapeIdentifier(name).split(':')
            expr = expr.length == 2 ? expr[1] : expr[0]
            // Attribute identifiers are CSS text, not JavaScript literals.
            // Encode escapes before inserting a name into a resolver string.
            name = escapeIdentifier(name).replace(
              /\\.|\x22/g,
              function (part: string) {
                return part == '"' ? '\\"' : part
              },
            )
            attributeSource = read.attr('e', name)
            attributeGuard = ''
            if (!NS && (!HTML_DOCUMENT || /^\[[\t\n\f\r ]*\|/.test(match[0]))) {
              attributeSource = 'n'
              attributeGuard = 'n=s.attributeValueNS(e,"' + name + '");'
            }
            if (match![2]! && !(test = Operators[match![2]!])) {
              emit("'" + expression + "'" + qsInvalid)
              return ''
            }
            if (match[4] === '') {
              test =
                match[2] == '~='
                  ? { p1: '(?!)', p2: '', p3: 'true' }
                  : (match![2] as string) in ATTR_STD_OPS && match![2]! != '~='
                    ? { p1: '^', p2: '$', p3: 'true' }
                    : test
            } else if (
              match[2] == '~=' &&
              /[\t\n\f\r ]/.test(unescapeIdentifier(match![4]!))
            ) {
              // A token cannot contain CSS whitespace. Decode first: the
              // space terminating a hexadecimal escape is not part of it.
              source = 'if(false){' + source + '}'
              break
            } else if (match![4]!) {
              value = escapeIdentifier(match![4]!)
              match[4] = value.replace(REX.RegExpChar, '\\$&')
              value = value.replace(/\\.|\x22/g, function (part: string) {
                return part == '"' ? '\\"' : part
              })
            }
            match[5] = (match![5]! || '').toLowerCase()
            type =
              match[5] == 'i' ||
              (match![5]! != 's' &&
                HTML_DOCUMENT &&
                HTML_TABLE[expr!.toLowerCase()])
                ? 'i'
                : ''
            if (match[2]) {
              attributePattern =
                '/' +
                (test as AttributeOperator).p1 +
                match[4] +
                (test as AttributeOperator).p2 +
                '/'
              attributePattern =
                !match[5] && type == 'i'
                  ? '(e.namespaceURI=="http://www.w3.org/1999/xhtml"?' +
                    attributePattern +
                    'i:' +
                    attributePattern +
                    ')'
                  : attributePattern + type
            }
            if (NS && match[2]) {
              source =
                'if(s.hasAttributeNS(e,"' +
                name +
                '",' +
                attributePattern +
                ',' +
                (test as AttributeOperator).p3 +
                ')){' +
                source +
                '}'
              break
            }
            source =
              attributeGuard +
              'if((' +
              (attributeGuard && match[2] ? 'n!==null&&' : '') +
              (!match![2]!
                ? NS
                  ? 's.hasAttributeNS(e,"' + name + '")'
                  : attributeGuard
                    ? 'n!==null'
                    : read.has('e', name)
                : !match![4]! && ATTR_STD_OPS[match![2]!] && match![2]! != '~='
                  ? attributeSource + '==""'
                  : match[2] == '=' &&
                      type == '' &&
                      (test as AttributeOperator).p3 == 'true'
                    ? attributeSource + '=="' + value + '"'
                    : '(' +
                      attributePattern +
                      ').test(' +
                      (match[2] == '~=' &&
                      (test as AttributeOperator).p3 == 'true'
                        ? '(' + attributeSource + '||"")'
                        : attributeSource) +
                      ')==' +
                      (test as AttributeOperator).p3) +
              ')){' +
              source +
              '}'
            break

          // *** General sibling combinator
          // E ~ F (F relative sibling of E)
          case 126 /* '~' */:
            match = selector.match(Patterns['relative']!)
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
          case 43 /* '+' */:
            match = selector.match(Patterns['adjacent']!)
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
          case 9 /* '\x09' */:
          case 32 /* '\x20' */:
            match = selector.match(Patterns['ancestor']!)
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
              (shadow
                ? 's.shadowParent(e,x||(c.nodeType?c:s.from))'
                : read.up('e')) +
              ')){' +
              source +
              '}e=N' +
              k +
              ';'
            break

          // *** Child combinator
          // E > F (F children of E)
          case 62 /* '>' */:
            match = selector.match(Patterns['children']!)
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
              (shadow
                ? 's.shadowParent(e,x||(c.nodeType?c:s.from))'
                : read.up('e')) +
              ')){' +
              source +
              '}e=N' +
              k +
              ';'
            break

          // *** user supplied combinators extensions
          case (selector[0] as string) in Combinators ? symbol : undefined:
            // for other registered combinators extensions
            match![match!.length - 1] = '*'
            source = Combinators[selector[0]!]!(match!) + source
            break

          // *** tree-structural pseudo-classes
          // :root, :empty, :first-child, :last-child, :only-child, :first-of-type, :last-of-type, :only-of-type
          case 58 /* ':' */:
            if (
              (selector.charAt(1) == ':' ||
                Patterns['pseudo_sng']!.test(selector)) &&
              !isPseudoExtension(selector)
            ) {
              if (!validPseudoTail(selector)) {
                emit("'" + expression + "'" + qsInvalid)
                return ''
              }
              // DOM queries never return pseudo-elements. Preserve the compiler's
              // synthetic { element, type } candidates for existing consumers.
              source =
                'if(!e.nodeType&&e.element&&e.type&&e.type.toLowerCase()==' +
                JSON.stringify(
                  selector.charAt(1) == ':'
                    ? selector.toLowerCase()
                    : ':' + selector.toLowerCase(),
                ) +
                '){e=e.element;' +
                source +
                '}'
              match = [selector, '']
              break
            }
            pseudo = readPseudo(selector)
            if (
              pseudo &&
              /^(?:lang|host|host-context|has-slotted|state|active-view-transition-type|active-view-transition|user-valid|user-invalid|xr-overlay|interest-source|interest-target|target-current|target-before|target-after)$/.test(
                pseudo.name,
              )
            ) {
              name = pseudo.name
              argument = pseudo.argument
              if (name == 'lang') {
                var ranges = argument === null ? [] : splitList(argument),
                  languageTests: string[] = [],
                  range,
                  quoted
                for (
                  var rangeIndex = 0;
                  rangeIndex < ranges.length;
                  ++rangeIndex
                ) {
                  range = ranges[rangeIndex]!
                  quoted =
                    /^(?:"(?:[^"\\\n\r\f]|\\[^\n\r\f])*"|'(?:[^'\\\n\r\f]|\\[^\n\r\f])*')$/.test(
                      range,
                    )
                  if (!quoted && !isIdent(range)) {
                    break
                  }
                  languageTests.push(
                    's.isLanguage(e,' +
                      JSON.stringify(
                        unescapeIdentifier(quoted ? range.slice(1, -1) : range),
                      ) +
                      ')',
                  )
                }
                if (!ranges.length || languageTests.length !== ranges.length) {
                  emit("'" + expression + "'" + qsInvalid)
                  return ''
                }
                source = 'if(' + languageTests.join('||') + '){' + source + '}'
              } else if (name == 'host' || name == 'host-context') {
                if (
                  argument === null
                    ? name != 'host'
                    : (argument = prepareCompound(argument)) === null ||
                      hasPseudoElement(argument) ||
                      !validateLogical(argument, false)
                ) {
                  emit("'" + expression + "'" + qsInvalid)
                  return ''
                }
                source =
                  'if(s.isHost(e,' +
                  JSON.stringify(argument) +
                  ',' +
                  (name == 'host-context') +
                  ',x||(c.nodeType?c:s.from))){' +
                  source +
                  '}'
              } else if (name == 'has-slotted') {
                if (
                  argument !== null &&
                  (!argument ||
                    hasPseudoElement(argument) ||
                    !isCompound(normalizeCombinators(argument), true) ||
                    !validateLogical(argument, false))
                ) {
                  emit("'" + expression + "'" + qsInvalid)
                  return ''
                }
                source =
                  'if(s.hasSlotted(e,' +
                  JSON.stringify(argument) +
                  ')){' +
                  source +
                  '}'
              } else {
                if (
                  name == 'state' || name == 'active-view-transition-type'
                    ? argument === null || !isIdent(argument, true)
                    : argument !== null
                ) {
                  emit("'" + expression + "'" + qsInvalid)
                  return ''
                }
                expr =
                  ':' + name + (argument === null ? '' : '(' + argument + ')')
                source =
                  'if(s.matchesNative(e,' +
                  JSON.stringify(expr) +
                  ')){' +
                  source +
                  '}'
              }
              match = [
                selector.slice(0, selector.length - pseudo.rest.length),
                pseudo.rest,
              ]
              break
            }
            if (
              (match = /^:heading(?:\(([^)]*)(?:\)|$))?(?![-\w])(.*)/i.exec(
                selector,
              ))
            ) {
              if (
                match![1]! !== undefined &&
                !/^[\t\n\f\r ]*[-+]?\d+[\t\n\f\r ]*(?:,[\t\n\f\r ]*[-+]?\d+[\t\n\f\r ]*)*$/.test(
                  match![1]!,
                )
              ) {
                emit("'" + expression + "'" + qsInvalid)
                return ''
              }
              // HTML heading semantics use the local name, including prefixed
              // HTML elements, and ignore ARIA role/level overrides.
              test =
                match![1] === undefined
                  ? '123456'
                  : match![1]!
                      .split(',')
                      .map(function (level) {
                        var n = +level
                        return n >= 1 && n <= 6 ? n : ''
                      })
                      .join('')
              source = !test
                ? 'if(false){' + source + '}'
                : 'if(e.namespaceURI=="http://www.w3.org/1999/xhtml"&&/^h[' +
                  (test || '1-6') +
                  ']$/.test(' +
                  read.tag('e') +
                  ')){' +
                  source +
                  '}'
            } else if ((match = selector.match(Patterns['structural']!))) {
              match![1] = match![1]!.toLowerCase()
              switch (match![1]!) {
                case 'scope':
                  // use the root (documentElement) when comparing against a document
                  source =
                    'if(e===(s.from.nodeType===9?s.from.documentElement:s.from)){' +
                    source +
                    '}'
                  break
                case 'root':
                  // there can only be one :root element, so exit the loop once found
                  source =
                    'if((e===s.doc.documentElement)){' +
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
                    'n=e;while((n=n.nextElementSibling)&&(n.localName!=o||n.namespaceURI!=e.namespaceURI));if(!n){' +
                    'n=e;while((n=n.previousElementSibling)&&(n.localName!=o||n.namespaceURI!=e.namespaceURI));}if(!n){' +
                    source +
                    '}'
                  break
                case 'last-of-type':
                  source =
                    'n=e;o=e.localName;while((n=n.nextElementSibling)&&(n.localName!=o||n.namespaceURI!=e.namespaceURI));if(!n){' +
                    source +
                    '}'
                  break
                case 'first-of-type':
                  source =
                    'n=e;o=e.localName;while((n=n.previousElementSibling)&&(n.localName!=o||n.namespaceURI!=e.namespaceURI));if(!n){' +
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
            else if ((match = matchNth(selector))) {
              match![1] = match![1]!.toLowerCase()
              switch (match![1]!) {
                case 'nth-child':
                case 'nth-of-type':
                case 'nth-last-child':
                case 'nth-last-of-type':
                  expr = /-of-type/i.test(match![1]!)
                  var nthFilter = match[3]
                  if (
                    nthFilter !== undefined &&
                    (expr || !validateLogical(nthFilter, false))
                  ) {
                    emit("'" + expression + "'" + qsInvalid)
                    return ''
                  }
                  if (match![1]! && match![2]!) {
                    type = /last/i.test(match![1]!)
                    if (match[2] == 'n' && nthFilter === undefined) {
                      source = 'if(true){' + source + '}'
                      break
                    } else if (match[2] == '1' && nthFilter === undefined) {
                      test = type ? 'next' : 'previous'
                      source = expr
                        ? 'n=e;o=e.localName;' +
                          'while((n=n.' +
                          test +
                          'ElementSibling)&&(n.localName!=o||n.namespaceURI!=e.namespaceURI));if(!n){' +
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
                      f = /n/i.test(match![2]!)
                      n = match![2]!.split('n')
                      a = parseInt(n[0]!, 10) || 0
                      b = parseInt(n[1]!, 10) || 0
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
                              ? n[0]!
                                ? 'n==' + b
                                : 'n>' + (b - 1)
                              : 'false'
                    }
                    if (nthFilter !== undefined) {
                      flag = '_f' + notFlag++
                      S_VARS.push(flag)
                      source =
                        'n=s.nthFiltered(e,' +
                        JSON.stringify(nthFilter) +
                        ',' +
                        !!type +
                        ',f?null:(' +
                        flag +
                        '||(' +
                        flag +
                        '=v?(v.' +
                        flag +
                        '||(v.' +
                        flag +
                        '={})):{})));if(n>0&&(' +
                        test +
                        ')){' +
                        source +
                        '}'
                      break
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
                    if (test == 'n==' + a && a! >= 1 && !expr) {
                      if (mode === true && !callback && !Config.LEGACY) {
                        // Dense selections usually visit siblings together.
                        // Find this parent's one qualifying child once, then
                        // compare identities. Locals live for this invocation
                        // only, so mutations and reentrant calls cannot reuse
                        // an earlier query's position.
                        flag = '_p' + notFlag++
                        S_VARS.push(flag, flag + 'v')
                        source =
                          'o=e.parentNode;if(o===' +
                          flag +
                          '){n=e===' +
                          flag +
                          'v;}' +
                          'else if(o&&k+1<l&&c[k+1].parentNode===o){' +
                          flag +
                          '=o;' +
                          flag +
                          'v=o.' +
                          (type ? 'last' : 'first') +
                          'ElementChild;' +
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
                          'ElementSibling;++n;}n=e===' +
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
                    if (mode === false && !Config.LEGACY) {
                      if (expr) {
                        flag = '_t' + notFlag++
                        S_VARS.push(flag, flag + 's')
                        source =
                          flag +
                          '=e.localName;' +
                          flag +
                          's=e.namespaceURI;n=1;o=e;' +
                          'while((o=o.' +
                          (type ? 'next' : 'previous') +
                          'ElementSibling)){' +
                          'if(o.localName===' +
                          flag +
                          '&&o.namespaceURI===' +
                          flag +
                          's)++n;}' +
                          'if((' +
                          test +
                          ')){' +
                          source +
                          '}'
                        break
                      }
                      source =
                        'n=1;o=e;while((o=o.' +
                        (type ? 'next' : 'previous') +
                        'ElementSibling))++n;if((' +
                        test +
                        ')){' +
                        source +
                        '}'
                      break
                    }
                    if (
                      mode === true &&
                      !callback &&
                      !Config.LEGACY &&
                      !expr &&
                      !type
                    ) {
                      // Ordered, nearby candidates can carry their sibling
                      // position forward. Sparse runs switch to the shared index.
                      flag = '_i' + notFlag++
                      S_VARS.push(flag, flag + 'n', flag + 's', flag + 't')
                      source =
                        'if(' +
                        flag +
                        's){n=s.nthElement(e,false);}else{' +
                        'n=1;o=' +
                        flag +
                        't?e.previousElementSibling:e.previousSibling;' +
                        'if((!' +
                        flag +
                        '||o!==' +
                        flag +
                        ')&&!' +
                        flag +
                        't&&o!==(o=e.previousElementSibling))' +
                        flag +
                        't=true;' +
                        'while(o&&o!==' +
                        flag +
                        '&&n<8){++n;o=o.previousElementSibling;}' +
                        'if(o===' +
                        flag +
                        '&&' +
                        flag +
                        '){n+=' +
                        flag +
                        'n;}' +
                        'else if(o){n=s.nthElement(e,false);' +
                        flag +
                        's=true;}' +
                        flag +
                        '=e;' +
                        flag +
                        'n=n;}if((' +
                        test +
                        ')){' +
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
                      (expr == 'OfType' && !Config.LEGACY ? ',!f' : '') +
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
              match![1] = match![1]!.toLowerCase()
              expr = match![2]!.replace(/\x22/g, '\\"')
              switch (match![1]!) {
                case 'is':
                case 'where':
                  if (
                    /^(?:[a-z][a-z0-9-]*)?(?:[.#][_a-zA-Z][-\w]*)+$/.test(
                      match![2]!,
                    )
                  ) {
                    // A simple compound cannot move e or contain an invalid
                    // forgiving-list item, so its predicate can guard the
                    // continuation directly without a temporary boolean.
                    source = compileSelector(match![2]!, source, mode, callback)
                  } else if (
                    /^[a-z][a-z0-9-]*(?:[\t\n\f\r ]*,[\t\n\f\r ]*[a-z][a-z0-9-]*)*$/.test(
                      match![2]!,
                    )
                  ) {
                    source =
                      'if(' +
                      splitList(match![2]!)
                        .map(function (tag) {
                          return HTML_DOCUMENT
                            ? '(' +
                                read.tag('e') +
                                '==' +
                                JSON.stringify(asciiLower(tag)) +
                                '||s.matchesTag(e,' +
                                JSON.stringify(tag) +
                                '))'
                            : read.tag('e') + '=="' + tag + '"'
                        })
                        .join('||') +
                      '){' +
                      source +
                      '}'
                  } else if (Config.FORGIVING) {
                    source =
                      'if(s.matchForgiving(' +
                      JSON.stringify(splitList(match![2]!)) +
                      ',e)){' +
                      source +
                      '}'
                  } else {
                    if (!validateLogical(match![2]!, false)) {
                      return ''
                    }
                    source = 'if(s.match("' + expr + '",e)){' + source + '}'
                  }
                  break
                case 'matches':
                  if (!validateLogical(match![2]!, false)) {
                    return ''
                  }
                  source = 'if(s.match("' + expr + '",e)){' + source + '}'
                  break
                case 'not':
                  if (hasPseudoElement(match[2]!)) {
                    emit("'" + expression + "'" + qsInvalid)
                    return ''
                  }
                  if (isCompound((argument = match![2]!))) {
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
                    if (!validateLogical(match![2]!, false)) {
                      return ''
                    }
                    source = 'if(!s.match("' + expr + '",e)){' + source + '}'
                  }
                  break
                case 'has':
                  argument = prepareHas(match![2]!)
                  if (argument === null) {
                    emit("'" + expression + "'" + qsInvalid)
                    return ''
                  }
                  match[2] = argument
                  if (!validateLogical(match![2]!, true)) {
                    return ''
                  }
                  argument = /^>[\t\n\f\r ]*([a-z][a-z0-9-]*|\*)$/.exec(
                    match![2]!,
                  )
                  if (argument) {
                    source =
                      'if(s.hasChild(e,"' + argument[1] + '")){' + source + '}'
                    break
                  }
                  source =
                    'if(s.has(' +
                    JSON.stringify(splitList(match![2]!)) +
                    ',e)){' +
                    source +
                    '}'
                  break
                default:
                  emit("'" + expression + "'" + qsInvalid)
                  break
              }
            }

            // Direction uses a single keyword. Language ranges are parsed above.
            else if ((match = selector.match(Patterns['linguistic']!))) {
              argument = match[2]!.toLowerCase()
              source =
                'if(s.isDirection(e,' +
                JSON.stringify(argument) +
                ')){' +
                source +
                '}'
            }

            // *** location pseudo-classes
            // :any-link, :link, :visited, :target, :defined
            else if ((match = selector.match(Patterns['locationpc']!))) {
              match![1] = match![1]!.toLowerCase()
              switch (match![1]!) {
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
            else if ((match = selector.match(Patterns['useraction']!))) {
              match![1] = match![1]!.toLowerCase()
              switch (match![1]!) {
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
                  source =
                    'if(s.matchesNative(e,":focus-within",!!s.doc.hasFocus&&s.doc.hasFocus()&&e.contains(s.doc.activeElement))){' +
                    source +
                    '}'
                  break
                default:
                  emit("'" + expression + "'" + qsInvalid)
                  break
              }
            }

            // *** user interface and form pseudo-classes
            // :enabled, :disabled, :read-only, :read-write, :placeholder-shown, :default
            else if ((match = selector.match(Patterns['inputstate']!))) {
              match![1] = match![1]!.toLowerCase()
              switch (match![1]!) {
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
                // Missing HTML input type is text. Avoid the host's type
                // normalization getter on this common path.
                case 'read-only':
                case '-moz-read-only':
                  source =
                    'if(' +
                    '(/^textarea$/i.test(e.localName)&&(e.readOnly||s.isDisabled(e)))||' +
                    '(/^input$/i.test(e.localName)&&((e.namespaceURI=="http://www.w3.org/1999/xhtml"&&!e.hasAttribute("type")||s.includes("|date|datetime-local|email|month|number|password|search|tel|text|time|url|week|","|"+e.type+"|"))?(e.readOnly||s.isDisabled(e)):true))||' +
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
                    '(/^input$/i.test(e.localName)&&(e.namespaceURI=="http://www.w3.org/1999/xhtml"&&!e.hasAttribute("type")||s.includes("|date|datetime-local|email|month|number|password|search|tel|text|time|url|week|","|"+e.type+"|"))&&!e.readOnly&&!s.isDisabled(e))||' +
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
                    '(s.includes("|textarea|password|number|search|email|text|tel|url|","|"+e.type+"|"))&&' +
                    'e.value==""' +
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
                    'if((e.form&&(e===n[x]&&s.includes("|image|submit|","|"+e.type+"|"))||' +
                    '((/^option$/i.test(e.localName))&&e.defaultSelected)||' +
                    '((s.includes("|radio|checkbox|","|"+e.type+"|"))&&e.defaultChecked)' +
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
            else if ((match = selector.match(Patterns['inputvalue']!))) {
              match![1] = match![1]!.toLowerCase()
              switch (match![1]!) {
                case 'checked':
                  source =
                    'if((/^input$/i.test(e.localName)&&' +
                    '(s.includes("|radio|checkbox|","|"+e.type+"|")&&e.checked)||' +
                    '(/^option$/i.test(e.localName)&&(e.selected||e.checked))' +
                    ')){' +
                    source +
                    '}'
                  break
                case 'indeterminate':
                  source =
                    'if((/^progress$/i.test(e.localName)&&!e.hasAttribute("value"))||' +
                    '(/^input$/i.test(e.localName)&&("checkbox"==e.type&&e.indeterminate&&!e.switch&&!e.hasAttribute("switch"))||' +
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
                    '(s.includes("|date|datetime-local|month|number|range|time|week|","|"+e.type+"|"))&&' +
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
                    '(s.includes("|date|datetime-local|month|number|range|time|week|","|"+e.type+"|"))&&' +
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
            else if ((match = selector.match(Patterns['rsrc_state']!))) {
              source =
                'if(s.isMediaState(e,' +
                JSON.stringify(match![1]!.toLowerCase()) +
                ')){' +
                source +
                '}'
            }

            // display state pseudo-classes. Helpers use native matching when
            // available and otherwise only properties observable from the DOM.
            else if ((match = selector.match(Patterns['disp_state']!))) {
              match![1] = match![1]!.toLowerCase()
              switch (match![1]!) {
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
            else if ((match = selector.match(Patterns['time_state']!))) {
              expr = ':' + match![1]!.toLowerCase()
              if (
                expr === ':current' &&
                match![2]!.charCodeAt(0) === 40 /* '(' */
              ) {
                match = matchLogical(selector, /^:(current)\(/i)
                if (
                  !match ||
                  !match![2]! ||
                  !splitList(match![2]!).every(item => isCompound(item)) ||
                  !validateLogical(match![2]!, false)
                ) {
                  emit("'" + expression + "'" + qsInvalid)
                  break
                }
                expr += '(' + match![2]! + ')'
              }
              source =
                'if(s.matchesNative(e,' +
                JSON.stringify(expr) +
                ')){' +
                source +
                '}'
            } else {
              // reset
              expr = false
              status = false

              // process registered selector extensions
              for (expr in Selectors) {
                if ((match = selector.match(Selectors[expr]!.Expression))) {
                  result = Selectors[expr]!.Callback(
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
        selector = match.pop()!
      }
      // end of while selector

      if (pendingTag) {
        source = pendingTag + source + '}'
      }
      return errors == previousErrors ? source : ''
    },
    // equivalent of w3c 'closest' method
    ancestor = function _closest(
      selectors: string,
      element: Element | null,
      callback: ((element: Element) => unknown) | undefined,
    ) {
      parse(selectors, true)
      if (element && element.ownerDocument !== doc) {
        switchContext(element)
      }
      var previousScope = Snapshot.from
      Snapshot.from = element || doc
      try {
        while (element) {
          if (match(selectors, element, callback)) {
            break
          }
          element = upOf(element)
        }
        return element
      } finally {
        Snapshot.from = previousScope
      }
    },
    match_assert = function (
      f: CompiledResolver[],
      element: Element,
      callback: ((element: Element) => unknown) | undefined,
    ) {
      for (var i = 0, l = f.length, r = false; l > i; ++i) {
        f[i]!(element, callback, null, false) && (r = true)
      }
      return r
    },
    match_collect = function (
      selectors: string[],
      callback: ((element: Element) => unknown) | undefined,
    ) {
      for (
        var i = 0, l = selectors.length || 0, f = Array<CompiledResolver>(l);
        l > i;
        ++i
      ) {
        f[i] = compile(selectors[i]!, false, callback)!
      }
      return f
    },
    // Comments disappear between tokens, never inside strings or escapes.
    // Keep a boundary when removing one would manufacture a different token.
    selectorComments = function (text: string) {
      if (!includes(text, '/*')) {
        return text
      }
      var result = '',
        quote = '',
        i = 0,
        end,
        c,
        before,
        after,
        escapedEnd = -1,
        hex
      while (i < text.length) {
        c = text[i++]!
        if (c == '\\') {
          hex = /^[0-9a-fA-F]{1,6}/.exec(text.slice(i))
          if (!quote && hex) {
            result += '\\' + ('000000' + hex[0]).slice(-6) + ' '
            i += hex[0].length
            if (/[\t\n\r\f ]/.test(text[i] || '')) {
              if (text[i++] == '\r' && text[i] == '\n') {
                ++i
              }
            }
            escapedEnd = result.length
          } else {
            result += c
            if (i < text.length) {
              result += text[i++]!
            }
          }
        } else if (quote) {
          result += c
          if (c == quote) {
            quote = ''
          }
        } else if (c == '"' || c == "'") {
          quote = c
          result += c
        } else if (c == '/' && text[i] == '*') {
          end = text.indexOf('*/', i + 1)
          i = end < 0 ? text.length : end + 2
          // Adjacent comments represent the same token boundary.
          while (text.slice(i, i + 2) == '/*') {
            end = text.indexOf('*/', i + 2)
            i = end < 0 ? text.length : end + 2
          }
          before =
            result.length == escapedEnd ? 'a' : result[result.length - 1] || ''
          after = text[i] || ''
          if (/:nth-(?:last-)?child\([^()]*[\t\n\f\r ]of$/i.test(result)) {
            result += ' '
          } else if (
            (/[\w\u0080-\uffff-]/.test(before) &&
              /[\w\u0080-\uffff(\\-]/.test(after)) ||
            (before == '#' && /[\w\u0080-\uffff\\-]/.test(after)) ||
            (/[~|^$*]/.test(before) && after == '=')
          ) {
            // An+B's `of` clause and attribute flags accept separate tokens.
            result +=
              (/^of(?:[\t\n\f\r ]|\/\*)/i.test(text.slice(i)) &&
                /:nth-(?:last-)?child\([^()]*$/i.test(result)) ||
              (/^[is](?:[\t\n\f\r ]|\])/i.test(text.slice(i)) &&
                /\[[^\]]*=[^\]]+$/i.test(result))
                ? ' '
                : '\x01'
          }
        } else {
          result += c
        }
      }
      return result
    },
    // Consume string continuations before whitespace normalization. Preserve
    // escape boundaries: removing a continuation must not extend a hex escape.
    stringContinuations = function (selectors: string) {
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
        c = selectors[i++]!
        if (c == '\\' && i == length && quote) {
          break
        }
        if (c == '\\' && i < length) {
          next = selectors[i]!
          if (quote && /[\r\n\f]/.test(next)) {
            ++i
            if (next == '\r' && selectors[i] == '\n') {
              ++i
            }
            continue
          }
          if (quote && /[0-9a-f]/i.test(next)) {
            j = i
            while (i < length && i - j < 6 && /[0-9a-f]/i.test(selectors[i]!)) {
              ++i
            }
            result += '\\' + ('000000' + selectors.slice(j, i)).slice(-6)
            if (/[\x20\t\r\n\f]/.test(selectors[i]! || '')) {
              next = selectors[i++]!
              if (next == '\r' && selectors[i] == '\n') {
                ++i
              }
            }
            continue
          }
          result += c + selectors[i++]!
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
    parse = function (
      selectors: string | string[] | null,
      type: boolean,
    ): string[] | false | null | undefined {
      var parsed

      // arguments validation
      if (arguments.length === 0) {
        emit(qsNotArgs, TypeError)
        return Config.VERBOSITY ? undefined : type ? none : false
      } else if (arguments[0] === '') {
        emit("''" + qsInvalid)
        return Config.VERBOSITY ? undefined : type ? none : false
      } else if (/^[.#]?\d/.test(selectors as string)) {
        emit("''" + qsInvalid)
        return Config.VERBOSITY ? undefined : type ? none : false
      }

      // input NULL or UNDEFINED
      if (typeof selectors != 'string') {
        selectors = '' + selectors
      }

      selectors = stringContinuations(selectorComments(selectors))
      if (!validBlocks(selectors)) {
        emit("'" + selectors + "'" + qsInvalid)
        return type ? none : false
      }
      // normalize input string
      parsed = selectors
        .replace(/\x00|\\$/g, '\ufffd')
        .replace(REX.CombineWSP, function (part: string) {
          return part[0] == '\\' ? part.replace(/\r\n/g, '\x20') : '\x20'
        })
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
          if (!(includes(parsed, ':is(') || includes(parsed, ':where('))) {
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

      if (selectors && !selectors.every(validPseudoSyntax)) {
        emit("'" + parsed + "'" + qsInvalid)
        return type ? none : false
      }
      return selectors as string[] | null
    },
    // equivalent of w3c 'matches' method
    match = function _matches(
      selectors: string,
      element: Element,
      callback?: (element: Element) => unknown,
    ) {
      if (arguments.length === 0) {
        emit(qsNotArgs, TypeError)
        return false
      }
      var resolver,
        cacheKey = !!callback + ':' + selectors

      if (element && element.ownerDocument !== doc) {
        switchContext(element)
      }

      if (element && (resolver = matchResolvers.get(cacheKey))) {
        return match_assert(resolver, element, callback)
      }

      resolver = match_collect(parse(selectors, false) as string[], callback)
      matchResolvers.set(cacheKey, resolver)

      return match_assert(resolver, element, callback)
    },
    // Public matches scopes :scope to its subject. Internal predicates retain
    // the surrounding query's scope while evaluating descendants and siblings.
    matchPublic = function (
      selectors: string,
      element: Element,
      callback?: (element: Element) => unknown,
    ) {
      if (arguments.length === 0) {
        emit(qsNotArgs, TypeError)
        return false
      }
      if (element && element.ownerDocument !== doc) {
        switchContext(element)
      }
      var previousScope = Snapshot.from
      Snapshot.from = element || doc
      try {
        return match(selectors, element, callback)
      } finally {
        Snapshot.from = previousScope
      }
    },
    // Invalid items do not discard the remaining forgiving selectors.
    matchForgiving = function (list: string[], element: Element) {
      for (var i = 0, l = list.length; l > i; ++i) {
        try {
          if (match(list[i]!, element)) {
            return true
          }
        } catch (e) {}
      }
      return false
    },
    // A direct-child type test needs no candidate array or relative resolver.
    hasChild = function (element: Element, tag: string) {
      var child = firstOf(element)
      while (child) {
        if (tag == '*' || matchesTag(child, tag)) {
          return true
        }
        child = nextOf(child)
      }
      return false
    },
    // true if element matches the selector
    has = function (list: string[], anchor: Element) {
      var context,
        found = false,
        i = 0,
        l = list.length,
        previous = Snapshot.anchor
      Snapshot.anchor = anchor
      try {
        for (; l > i; ++i) {
          context = /^[+~]/.test(list[i]!) ? upOf(anchor) : anchor
          if (!list[i]) {
            emit(qsInvalid)
            return false
          }
          // Compile even a root sibling argument, whose candidate set is empty.
          // Later invalid items must not be hidden by an earlier match.
          if (
            collect(
              (parse('* ' + list[i], true) as string[]).map(function (
                selector: string,
              ) {
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
    firstRoots:
      | WeakMap<object, CollectionState<PrefixSnapshot>>
      | null
      | undefined = null,
    // Cache only a bounded candidate prefix. Recheck tag and resolver state
    // on every call; synchronous mutation records invalidate class membership.
    firstClass = function (
      context: EngineContext,
      name: string,
      tag?: string | null | undefined,
      resolver?: CompiledResolver | null | undefined,
      filtered?: Record<string, FilteredNthState>,
    ) {
      var element: Element | null | undefined,
        next: Element | null,
        value,
        offset,
        before,
        after,
        state: CollectionState<PrefixSnapshot> | null | undefined,
        cached: PrefixSnapshot | undefined,
        nodes: Element[],
        candidates: Element[] | undefined,
        i,
        view
      if (QUIRKS_MODE) {
        return null
      }
      // A cached prefix depends on subtree order and class text, not the
      // owner document. Adoption preserves it; tag/resolver checks stay live.
      state = firstRoots && firstRoots.get(context)
      if (state) {
        if (state.observer!.takeRecords().length) {
          state.copies = createWeakMap<object, PrefixSnapshot>()!
        }
        cached = state.copies.get(context)
      } else if (
        primordials.WeakRefCtor &&
        (view = ((context.ownerDocument || context) as Document).defaultView) &&
        view.MutationObserver
      ) {
        firstRoots ||
          (firstRoots = createWeakMap<
            object,
            CollectionState<PrefixSnapshot>
          >())
        if (firstRoots) {
          state = {
            copies: createWeakMap<object, PrefixSnapshot>()!,
            observer: null,
          }
          state.observer = (
            Factory as typeof Factory & {
              _observeCollections<Value>(
                root: Node,
                view: Pick<typeof globalThis, 'MutationObserver'>,
                state: CollectionState<Value>,
              ): MutationObserver
            }
          )['_observeCollections'](context, view, state)
          firstRoots.set(context, state)
        }
      }
      if (!cached) {
        nodes = []
        element = context.firstElementChild
        while (element && nodes.length < 16) {
          nodes[nodes.length] = element
          next = element.firstElementChild
          if (!next) {
            while (
              element !== context &&
              !(next = element.nextElementSibling)
            ) {
              element = element.parentNode as Element | null
              if (!element) {
                break
              }
            }
            if (!element || element === context) {
              break
            }
          }
          element = next
        }
        cached = { nodes: nodes, classes: createCache<Element[]>(64) }
        state && state.copies.set(context, cached)
      }
      candidates = cached.classes.get(name)
      if (!candidates) {
        candidates = []
        for (i = 0; i < cached.nodes.length; ++i) {
          element = cached.nodes[i]!
          value = classOf(element)
          offset = -1
          while (value && (offset = value.indexOf(name, offset + 1)) >= 0) {
            before = offset ? value.charCodeAt(offset - 1) : 32 /* space */
            after =
              offset + name.length < value.length
                ? value.charCodeAt(offset + name.length)
                : 32 /* space */
            if (
              (before == 32 /* space */ ||
                before == 9 /* tab */ ||
                before == 10 /* LF */ ||
                before == 12 /* FF */ ||
                before == 13) /* CR */ &&
              (after == 32 /* space */ ||
                after == 9 /* tab */ ||
                after == 10 /* LF */ ||
                after == 12 /* FF */ ||
                after == 13) /* CR */
            ) {
              candidates[candidates.length] = element
              break
            }
          }
        }
        cached.classes.set(name, candidates)
      }
      for (i = 0; i < candidates.length; ++i) {
        element = candidates[i]!
        if (
          (!tag || tag == '*' || matchesTag(element, tag)) &&
          (!resolver || resolver(element, null, context, false, filtered))
        ) {
          return element
        }
      }
      return null
    },
    first = function _querySelector(
      selectors: string,
      context?: EngineContext | null,
      callback?: ElementCallback,
    ) {
      var element, match, collection, i, length, lookupContext
      if (arguments.length === 0) {
        emit(qsNotArgs, TypeError)
        return null
      }

      // Root ID maps return the first duplicate in tree order. Element scopes
      // cannot use an owner-document lookup because its first hit may be outside.
      // Keep attribute escapes, flags, namespaces, and empty values on the full
      // parser path. Empty IDs are attributes but are absent from the ID map.
      lookupContext = context || doc
      if (
        typeof selectors == 'string' &&
        selectors &&
        lookupContext.getElementById &&
        (lookupContext.nodeType == 9 ||
          (!Config.LEGACY && lookupContext.nodeType == 11)) &&
        ((match = reSimpleId.exec(selectors)) ||
          (!Config.LEGACY &&
            selectors.charCodeAt(0) == 91 /* '[' */ &&
            (match =
              /^\[id=(?:"([-\w]+)"|'([-\w]+)'|([_a-zA-Z][-\w]*))\]$/.exec(
                selectors,
              )) &&
            isHTML(lookupContext.ownerDocument || lookupContext)))
      ) {
        if (
          lastContext !== lookupContext ||
          (lookupContext !== doc && lookupContext.ownerDocument !== doc)
        ) {
          lastContext = switchContext(lookupContext)
        }
        element = lookupContext.getElementById(
          unescapeIdentifier(match![1] || match![2] || match![3]!),
        )
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
          if (
            lastContext !== context ||
            (context !== doc && context.ownerDocument !== doc)
          ) {
            lastContext = switchContext(context)
          }
          element = match![2]! && firstClass(context, match![2]!, match![1]!)
          if (element) {
            if (typeof callback == 'function') {
              callback(element)
            }
            return element
          }
          collection = match![2]!
            ? context.getElementsByClassName!(match![2]!)
            : hasForeignTypes(context)
              ? byTag(match![1]!, context)
              : !HTML_DOCUMENT && match![1] != '*'
                ? byTagNS(context, match![1]!)
                : context.getElementsByTagName!(match![1]!)
          element = collection[0] || null
          if (match![2]! && match![1]! && match![1]! != '*') {
            i = 0
            while (element && !matchesTag(element, match![1]!)) {
              // Reading a live collection's length can itself scan the DOM.
              // The common first-candidate hit needs no length at all.
              if (i === 0) {
                length = collection.length
              }
              element = ++i < length! ? collection[i] : null
            }
          }
          if (element && typeof callback == 'function') {
            callback(element)
          }
          return element
        }
      }

      if (!Config.LEGACY && typeof selectors == 'string' && selectors) {
        return firstCompiled(selectors, context, callback)
      }

      return (
        select(
          selectors,
          context,
          typeof callback == 'function'
            ? function firstMatchCallback(element: Element) {
                callback(element)
                return false
              }
            : firstMatch,
        )[0] || null
      )
    },
    // First-match plans validate every group before examining candidates.
    // They retain compiled code and tokens, never live DOM collections.
    firstCompiled = function (
      selectors: string,
      context: EngineContext | null | undefined,
      callback: ElementCallback,
    ) {
      var plan,
        resolver,
        filtered,
        i,
        token,
        name,
        api,
        collection,
        result,
        element = null
      context || (context = doc)
      if (
        lastContext !== context ||
        (context !== doc && context.ownerDocument !== doc)
      ) {
        lastContext = switchContext(context)
      }
      plan = firstResolvers.get(selectors)
      if (!plan) {
        result = collect(
          parse(selectors, true) as string[],
          context,
          null,
          false,
          true,
        )
        plan = { factory: result.factory, nodeset: result.nodeset }
        firstResolvers.set(selectors, plan)
      }
      for (i = 0; i < plan.nodeset.length; ++i) {
        resolver = plan.factory[i]!
        filtered = resolver.filtered ? {} : undefined
        token = plan.nodeset[i]!
        name = token.slice(1)
        api = method[token[0]! as keyof typeof method] as
          | 'getElementsByTagName'
          | 'getElementsByClassName'
        result =
          token.charCodeAt(0) == 46 /* '.' */ &&
          !/[\t\n\f\r ]/.test(name) &&
          firstClass(context, name, null, resolver, filtered)
        if (result) {
          if (!element || result.compareDocumentPosition(element) & 4) {
            element = result
          }
          continue
        }
        collection =
          !Config.LEGACY &&
          (HTML_DOCUMENT || token[0] != '*') &&
          (token[0] != '*' || !hasForeignTypes(context)) &&
          (token[0] == '*' || (token[0] == '.' && !/[\t\n\f\r ]/.test(name))) &&
          api in context
            ? context[api]!(name)
            : fetch[token[0]!]!(name, context)
        result = collection[0]
        if (result && !resolver(result, null, context, false, filtered)) {
          var j = 1,
            length
          // Most first matches occur near the start. Defer a live collection's
          // length until a short bounded probe has failed.
          for (; j < 8; ++j) {
            result = collection[j]
            if (!result || resolver(result, null, context, false, filtered)) {
              break
            }
          }
          if (j === 8) {
            result = null
            for (length = collection.length; j < length; ++j) {
              if (resolver(collection[j]!, null, context, false, filtered)) {
                result = collection[j]
                break
              }
            }
          }
        }
        if (
          result &&
          (!element || result.compareDocumentPosition(element) & 4)
        ) {
          element = result
        }
      }
      if (element && typeof callback == 'function') {
        callback(element)
      }
      return element
    },
    // equivalent of w3c 'querySelectorAll' method
    DESCENT_PROBE = 128,
    childPlans = createCache<{
      tag: string | undefined
      cls: string
      tags: string[]
    } | null>(),
    selectChildren = function (selectors: string, context: EngineContext) {
      var plan = childPlans.get(selectors),
        found,
        roots,
        root,
        candidates,
        element,
        parent,
        previous,
        results: Element[] = [],
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
              tag: found[1]!,
              cls: found[2]!,
              tags: found[3]!.split(/\s*>\s*/).slice(1),
            }
          : null
        childPlans.set(selectors, plan)
      }
      if (!plan) {
        return null
      }
      roots = context.getElementsByClassName!(plan.cls)
      length = roots.length
      // Decide from live counts before copying or walking a wide anchor set.
      // A changed tree can choose a different route on the next call.
      if (length > DESCENT_PROBE) {
        return null
      }
      if (length >= 16) {
        // One terminal lookup is cheaper than a scoped lookup per anchor when
        // it produces no more candidates than there are anchors to inspect.
        if (
          context.getElementsByTagName!(plan.tags[plan.tags.length - 1]!)
            .length <= length
        ) {
          return null
        }
        roots = collectionSnapshot(roots, context, length)
      }
      for (i = 0; i < length; ++i) {
        root = roots[i]!
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
        candidates = collectionSnapshot(
          root.getElementsByTagName!(plan.tags[plan.tags.length - 1]),
          root,
          undefined,
          true,
        )
        for (j = 0, k = candidates.length; j < k; ++j) {
          element = candidates[j]!
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
    partCounts = createCache<number>(),
    reTagChain =
      /^[.A-Za-z][-\w]*(?:\.[-\w]+)?(?:\x20[.A-Za-z][-\w]*(?:\.[-\w]+)?)+$/,
    reChainPart = /^([A-Za-z][-\w]*)?(?:\.([-\w]+))?$/,
    fetchLevel = function (
      part: { cls: string | undefined; tag: string | undefined },
      root: EngineContext,
      out: Element[],
    ) {
      var found, i, l

      if (part.cls !== undefined) {
        found = collectionSnapshot(
          root.getElementsByClassName!(part.cls),
          root,
          undefined,
          true,
        )
        l = found.length
        if (part.tag === undefined) {
          for (i = 0; l > i; ++i) {
            out[out.length] = found[i]!
          }
        } else {
          for (i = 0; l > i; ++i) {
            if (
              found[i]!.localName == part.tag ||
              (HTML_DOCUMENT &&
                found[i]!.namespaceURI == NAMESPACE &&
                found[i]!.localName == part.tag.toLowerCase())
            ) {
              out[out.length] = found[i]!
            }
          }
        }
      } else {
        found = collectionSnapshot(
          root.getElementsByTagName!(part.tag!),
          root,
          undefined,
          true,
        )
        l = found.length
        for (i = 0; l > i; ++i) {
          out[out.length] = found[i]!
        }
      }

      return out
    },
    countPart = function (
      part: { cls: string | undefined; tag: string | undefined },
      context: EngineContext,
    ) {
      var count,
        key = part.cls !== undefined ? '.' + part.cls : part.tag!

      if ((count = partCounts.get(key)) === undefined) {
        count = (
          part.cls !== undefined
            ? context.getElementsByClassName!(part.cls)
            : context.getElementsByTagName!(part.tag!)
        ).length
        partCounts.set(key, count)
      }

      return count
    },
    descendChain = function (
      chain: Array<{ cls: string | undefined; tag: string | undefined }>,
      context: EngineContext,
    ) {
      var budget = -1,
        i,
        j,
        k,
        l,
        level,
        m,
        next: Element[],
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
        !HTML_DOCUMENT ||
        context.nodeType != 9 ||
        !context.getElementsByClassName ||
        !context.getElementsByTagName
      ) {
        return null
      }

      l = chain.length
      level = fetchLevel(chain[0]!, context, [])
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
            budget = countPart(chain[l - 1]!, context)
          }
          want = spent + size
          for (m = k + 1; l > m; ++m) {
            want += countPart(chain[m - 1]!, context)
          }
          if (want > budget) {
            return null
          }
        }
        spent += size
        part = chain[k]!
        next = []
        prev = null
        for (i = 0, j = level.length; j > i; ++i) {
          node = level[i]!
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
    parseChain = function (selectors: string) {
      var i,
        l,
        match,
        parts: Array<
          string | { tag: string | undefined; cls: string | undefined }
        > = selectors.split('\x20')

      for (i = 0, l = parts.length; l > i; ++i) {
        match = reChainPart.exec(parts[i] as string)
        if (!match || (match![1] === undefined && match[2] === undefined)) {
          return null
        }
        parts[i] = { tag: match![1]!, cls: match![2]! }
      }

      return parts as Array<{
        tag: string | undefined
        cls: string | undefined
      }>
    },
    descentDeclined = createCache(),
    select = function _querySelectorAll(
      selectors: string,
      context: EngineContext | null | undefined,
      callback?: ElementCallback,
    ) {
      var descended,
        nodes: Element[] = [],
        resolver

      arguments.length == 0 && emit(qsNotArgs, TypeError)

      context || (context = doc)
      lastContext !== context && (lastContext = switchContext(context))

      if (
        typeof selectors == 'string' &&
        includes(selectors, '>') &&
        callback === undefined &&
        !Config.LEGACY &&
        HTML_DOCUMENT &&
        !hasForeignTypes(context) &&
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
        !hasForeignTypes(context) &&
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
              list = fetch[n[i]![0]!]!(n[i]!.slice(1), context)
              if (f[i] !== null) {
                f[i]!(list, callback, context, nodes)
              } else {
                nodes = nodes.concat(
                  isInstanceOf(list) ? sliceCall(list) : (list as Element[]),
                )
              }
            }
            if (l > 1 && nodes.length > 1) {
              nodes.sort(documentOrder)
              hasDupes && (nodes = unique(nodes))
            }
          } else if (n.length) {
            list = fetch[n[0]![0]!]!(n[0]!.slice(1), context)
            nodes = f[0]
              ? f[0](list, callback, context, nodes)
              : (list as Element[])
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

      resolver = collect(parse(selectors, true) as string[], context, callback)
      nodes = resolver.results

      // Cache the query plan, never the answer. 'results' is a live list of
      // matched elements, so caching the whole collection would keep a
      // removed subtree alive for as long as its
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
    optimize = function (selector: string, token: RegExpMatchArray) {
      var index = token.index!,
        length = token[1]!.length + token[2]!.length
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
    // Compile query plans and execute candidate lookups only when needed.
    collect = function (
      selectors: string[],
      context: EngineContext,
      callback: ElementCallback,
      relative?: boolean | undefined,
      firstOnly?: boolean | undefined,
    ) {
      var i,
        l,
        seen: Record<string, boolean> = {},
        token: string[] = ['', '*', '*'],
        optimized = selectors,
        factory = Array<CompiledResolver | null>(selectors.length),
        candidates: ArrayLike<Element>,
        nodeset = Array<string>(selectors.length),
        results: Element[] = [],
        type

      for (i = 0, l = selectors.length; l > i; ++i) {
        if (!seen[selectors[i]!] && (seen[selectors[i]!] = true)) {
          type = selectors[i]!.match(reOptimizer)
          // Escaped delimiters can resemble a terminal tag inside an attribute.
          // Compile escaped selectors intact instead of narrowing that token.
          if (
            type &&
            type[1] != ':' &&
            selectors[i]!.indexOf('\\') < 0 &&
            (token = type)
          ) {
            token[1]! || (token[1] = '*')
            optimized[i] = optimize(optimized[i]!, token as RegExpMatchArray)
          } else {
            token = ['', '*', '*']
            // A terminal union of types can fetch its alternatives instead
            // of every element. Keep the complete predicate in the resolver,
            // including any compound or ancestor constraints around the list.
            type =
              /:(?:is|where)\(([a-z][a-z0-9-]*(?:[\t\n\f\r ]*,[\t\n\f\r ]*[a-z][a-z0-9-]*)+)\)$/.exec(
                selectors[i]!,
              )
            if (
              !firstOnly &&
              type &&
              /^[.#*\w\t\n\f\r >+~-]*$/.test(selectors[i]!.slice(0, type.index))
            ) {
              token = ['', '?', type[1]!]
            }
          }
          // Class lookup narrows candidates; the attribute resolver still
          // checks case and values, including in quirks mode.
          if (
            HTML_DOCUMENT &&
            !Config.LEGACY &&
            (type = selectors[i]!.match(Patterns['attribute']!)) &&
            type[0] == selectors[i]! &&
            type[1] == 'class' &&
            type[2] == '~=' &&
            type[4] &&
            type[5] != 'i' &&
            !/[\t\n\f\r ]/.test(unescapeIdentifier(type[4])) &&
            Operators['~=']!.p1 == '(^|[\\t\\n\\f\\r ])' &&
            Operators['~=']!.p2 == '([\\t\\n\\f\\r ]|$)' &&
            Operators['~=']!.p3 == 'true'
          ) {
            token = ['', '.', type[4]]
          }
        }

        // unescape before recording the token: 'nodeset' is what a later
        // run rebuilds its candidate list from, so the two must agree
        token[2] = unescapeIdentifier(token[2]!)
        nodeset[i] = token[1]! + token[2]!
        factory[i] = compile(optimized[i]!, !firstOnly, null, relative)

        if (firstOnly) {
          continue
        }

        candidates = fetch[token[1]!]!(token[2]!, context)
        if (factory[i]!) {
          factory[i]!(candidates, callback, context, results)
        } else {
          concatList(results, candidates)
        }
      }

      if (l > 1) {
        results.sort(documentOrder)
        hasDupes && (results = unique(results))
      }

      return {
        factory: factory,
        nodeset: nodeset,
        results: results,
      }
    },
    // handlers needed for the :hover pseudo-class
    // track state change in browsers and headless
    hoverWanted = false,
    // null is uninitialized; undefined means WeakMap is unavailable.
    hoverTracked:
      | WeakMap<Document, { target: EventTarget | null | undefined }>
      | null
      | undefined = null,
    hoverDoc: Document | undefined,
    hoverRecord: { target: EventTarget | null | undefined } | undefined,
    hoverChanged = function (event: MouseEvent) {
      var targetDoc =
          (event.target as Node).ownerDocument || (event.target as Document),
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
    _closest: Element['closest'],
    _matches: Element['matches'],
    _querySelector: Element['querySelector'],
    _querySelectorAll: Element['querySelectorAll'],
    _querySelectorDoc: Document['querySelector'],
    _querySelectorAllDoc: Document['querySelectorAll'],
    // overrides QSA methods (only for browsers)
    // Build [ ...args, tail ] in one allocation. The QSA wrappers below hand
    // their own arguments plus a resolver to parseQSArgs; slicing and then
    // concatenating allocates twice, ~113ns per call against ~9ns sized by
    // arity. Unrolled to eight, well past the three these wrappers take,
    // because the cases cost nothing to carry and a longer call still lands on
    // the general form.
    argsWith = function <Value>(args: ArrayLike<Value>, tail: Value) {
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
          return (sliceCall as <Value>(args: ArrayLike<Value>) => Value[])(
            args,
          ).concat(tail)
      }
    },
    install = function (all?: boolean) {
      var Element = global.Element,
        HTMLElement = global.HTMLElement,
        Document = global.Document,
        DocumentFragment = global.DocumentFragment

      // Saved DOM methods are invoked with their receiver or restored below.
      /* oxlint-disable typescript/unbound-method */
      _closest = Element.prototype.closest
      _matches = Element.prototype.matches

      _querySelector = Element.prototype.querySelector
      _querySelectorAll = Element.prototype.querySelectorAll

      _querySelectorDoc = Document.prototype.querySelector
      _querySelectorAllDoc = Document.prototype.querySelectorAll
      /* oxlint-enable typescript/unbound-method */

      // oxlint-disable-next-line typescript/no-unnecessary-type-parameters -- Native wrappers supply the resolver return type.
      function parseQSArgs<Result>(
        this: EngineContext,
        ...args: unknown[]
      ): Result
      // oxlint-disable-next-line typescript/no-unnecessary-type-parameters -- Native wrappers supply the resolver return type.
      function parseQSArgs<Result>(this: EngineContext): Result {
        var method = arguments[arguments.length - 1] as (
          ...args: unknown[]
        ) => Result
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
        function closest(this: Element) {
          return (parseQSArgs<Element | null>).apply(
            this,
            argsWith(arguments, ancestor),
          )
        }

      Element.prototype.matches = HTMLElement.prototype.matches =
        function matches(this: Element): this is Element {
          return (parseQSArgs<boolean>).apply(this, argsWith(arguments, match))
        } as Element['matches']

      Element.prototype.querySelector = HTMLElement.prototype.querySelector =
        function querySelector(this: EngineContext) {
          return (parseQSArgs<Element | null>).apply(
            this,
            argsWith(arguments, first),
          )
        }

      Element.prototype.querySelectorAll =
        HTMLElement.prototype.querySelectorAll = function querySelectorAll(
          this: EngineContext,
        ) {
          return toNodeList(
            (parseQSArgs<Element[]>).apply(this, argsWith(arguments, select)),
          ) as NodeListOf<Element>
        }

      Document.prototype.querySelector =
        DocumentFragment.prototype.querySelector = function querySelector(
          this: EngineContext,
        ) {
          return (parseQSArgs<Element | null>).apply(
            this,
            argsWith(arguments, first),
          )
        }

      Document.prototype.querySelectorAll =
        DocumentFragment.prototype.querySelectorAll = function querySelectorAll(
          this: EngineContext,
        ) {
          return toNodeList(
            (parseQSArgs<Element[]>).apply(this, argsWith(arguments, select)),
          ) as NodeListOf<Element>
        }

      if (all && legacyHooks) {
        legacyHooks.installFrames(
          doc,
          window => Factory(window) as unknown as typeof NW.Dom,
        )
      }
    },
    // restore QSA methods (only for browsers)
    uninstall = function () {
      var Element = global.Element,
        HTMLElement = global.HTMLElement,
        Document = global.Document,
        DocumentFragment = global.DocumentFragment

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
    none = Array<never>(),
    // context
    lastContext: EngineContext | undefined,
    // cached lambdas
    matchLambdas = createCache<CompiledResolver | null>(),
    selectLambdas = createCache<CompiledResolver | null>(),
    // cached resolvers
    matchResolvers = createCache<CompiledResolver[]>(),
    selectResolvers = createCache<QueryPlan>(),
    firstResolvers = createCache<QueryPlan>(),
    // passed to resolvers
    Snapshot: {
      matchesTag: typeof matchesTag
      mayMatch: typeof mayMatch
      ancestorMask: typeof ancestorMask
      clearAncestorMasks: typeof clearAncestorMasks
      classOf: typeof classOf
      includes: LegacyReaders['includes']
      attrOf: LegacyReaders['attrOf']
      hasAttrOf: LegacyReaders['hasAttrOf']
      tagOf: LegacyReaders['tagOf']
      idOf: LegacyReaders['idOf']
      legacyClassOf: LegacyReaders['legacyClassOf']
      upOf: LegacyReaders['upOf']
      nextOf: LegacyReaders['nextOf']
      prevOf: typeof _prevOf
      firstOf: LegacyReaders['firstOf']
      connectedOf: LegacyReaders['connectedOf']
      anchor: Element | null
      isDefined: typeof isDefined
      HOVER?: EventTarget | null | undefined
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
      nthFiltered: typeof nthFiltered
      isMediaState: typeof isMediaState
      isDirection: typeof isDirection
      isLanguage: typeof isLanguage
      isHost: typeof isHost
      hasSlotted: typeof hasSlotted
      shadowParent: typeof shadowParent
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
      attributeValueNS: typeof attributeValueNS
    } = {
      doc: doc,
      from: doc,
      root: root,
      anchor: null,

      byTag: byTag,
      includes: includes,
      attrOf: attrOf,
      hasAttrOf: hasAttrOf,
      tagOf: tagOf,
      idOf: idOf,
      legacyClassOf: modernReaders.legacyClassOf,
      upOf: upOf,
      nextOf: nextOf,
      prevOf: _prevOf,
      firstOf: firstOf,
      connectedOf: connectedOf,

      has: has,
      hasChild: hasChild,
      first: first,
      match: match,
      matchForgiving: matchForgiving,
      select: select,

      ancestor: ancestor,

      matchesTag: matchesTag,
      mayMatch: mayMatch,
      ancestorMask: ancestorMask,
      clearAncestorMasks: clearAncestorMasks,

      nthOfType: nthOfType,
      nthElement: nthElement,
      nthFiltered: nthFiltered,

      isDirection: isDirection,
      isLanguage: isLanguage,
      isHost: isHost,
      hasSlotted: hasSlotted,
      shadowParent: shadowParent,
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
      attributeValueNS: attributeValueNS,
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
      match: matchPublic,
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

      // Register the optional module once. Each engine owns its hook state.
      registerLegacyHooks: function (factory: LegacyHookFactory): boolean {
        if (legacyHooks) {
          return false
        }
        legacyHooks = factory({
          MapCtor: primordials.MapCtor,
          WeakMapCtor: primordials.WeakMapCtor,
          StringPrototypeIncludes: primordials.StringPrototypeIncludes,
          isHTML: () => HTML_DOCUMENT,
          isQuirks: () => QUIRKS_MODE,
          byTag: (tag, context) => byTag(tag, context),
        })
        createWeakMap = legacyHooks.createWeakMap
        if (!legacyHooks.hasMap) {
          createCache = legacyHooks.createCache
          typeRoutes = createCache()
          childPlans = createCache()
          partCounts = createCache()
          descentDeclined = createCache()
          Dom.matchLambdas = matchLambdas = createCache()
          Dom.selectLambdas = selectLambdas = createCache()
          Dom.matchResolvers = matchResolvers = createCache()
          Dom.selectResolvers = selectResolvers = createCache()
          firstResolvers = createCache()
        }
        initialize(doc)
        configure({}, true)
        return true
      },

      // register a new selector combinator symbol and its related function resolver
      registerCombinator: function (
        combinator: string,
        resolver: (match: RegExpMatchArray) => string,
      ) {
        var i = 0,
          l = combinator.length,
          symbol
        for (; l > i; ++i) {
          if (combinator[i] != '=') {
            symbol = combinator[i]
            break
          }
        }
        if (CFG.combinators.indexOf(symbol!) < 0) {
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
      registerOperator: function (
        operator: string,
        resolver: AttributeOperator,
      ) {
        var i = 0,
          l = operator.length,
          symbol
        for (; l > i; ++i) {
          if (operator[i] != '=') {
            symbol = operator[i]
            break
          }
        }
        if (CFG.operators.indexOf(symbol!) < 0 && !Operators[operator]) {
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
      registerSelector: function (
        name: string | number,
        rexp: RegExp,
        func: SelectorExtension['Callback'],
      ) {
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
