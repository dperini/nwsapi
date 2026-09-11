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

type CollectionState<Value> = import('./types.mts').CollectionState<Value>
type DirectionHelpers = import('./types.mts').DirectionHelpers
type EngineGlobal = import('./types.mts').EngineGlobal
type ForeignTypeState = import('./types.mts').ForeignTypeState
type IdentifierSyntax = import('./types.mts').IdentifierSyntax
type Primordials = import('./types.mts').Primordials
;(function Export(
  global: EngineGlobal | undefined,
  factory: (global: EngineGlobal) => unknown,
) {
  'use strict'

  // Load shims before the library. All engines share these startup references.
  var uncurryThis = Function.prototype.bind.bind(Function.prototype.call),
    FunctionPrototypeToString: (value: unknown) => string = uncurryThis(
      Function.prototype.toString,
    ),
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
  {
    validateMapConstructors()
  }
  primordials.ObjectDefineProperty(factory, '_primordials', {
    value: primordials,
  })

  primordials.ObjectDefineProperty(factory, '_core', {
    value: /* @bundle:core */ {},
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

      var parenthesized: string,
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
        return require('./adapter/dom-selector.js')
      },
    })
  } else if (typeof define == 'function' && define['amd']) {
    define(factory)
  } else {
    global!.NW || (global!.NW = {})
    global!.NW.Dom = factory(global!)
  }

  function validateMapConstructors() {
    for (
      var mapIndex = 0, mapNamesLength = mapNames.length;
      mapIndex < mapNamesLength;
      ++mapIndex
    ) {
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
  }
})(this, function Factory(global: EngineGlobal) {
  return (
    Factory as typeof Factory & { _core: typeof import('./factory.mts') }
  )._core.createEngine(global, Factory)
})
