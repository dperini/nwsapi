/*
 * Copyright (C) 2007-2026 Diego Perini
 * All rights reserved.
 *
 * nwsapi.js - Fast CSS Selectors API Engine
 *
 * Author: Diego Perini <diego.perini at gmail com>
 * Version: 2.2.28
 * Created: 20070722
 * Release: 20260918
 *
 * License:
 *  https://javascript.nwbox.com/nwsapi/MIT-LICENSE
 * Download:
 *  https://javascript.nwbox.com/nwsapi/nwsapi.js
 */

(function Export(global, factory) {

  'use strict';

  if (typeof module == 'object' && typeof exports == 'object') {
    module.exports = factory;
  } else if (typeof define == 'function' && define['amd']) {
    define(factory);
  } else {
    global.NW || (global.NW = { });
    global.NW.Dom = factory(global, Export);
  }

})(this, function Factory(global, Export) {

  var version = 'nwsapi-2.2.28',

  doc = global.document,
  root = doc.documentElement,
  slice = Array.prototype.slice,

  // The host matcher is captured here, before anything can replace it, and
  // node.matches is never consulted at match time. A host is free to wire
  // Element.prototype.matches back to this engine, which is what jsdom does,
  // and calling it while resolving a state pseudo-class re-enters the lambda
  // that asked for the state: the recursion only ends when the stack does,
  // and the RangeError is swallowed below. Passing a document alone, as jsdom
  // does, leaves no matcher at all, which is the intended outcome: there is
  // no native state to read.
  NATIVE_MATCHES = (function(proto) {
    return (proto && (proto.matches || proto.webkitMatchesSelector ||
      proto.mozMatchesSelector || proto.msMatchesSelector)) || null;
  })(global.Element && global.Element.prototype),

  HSP = '\\x20\\t',
  VSP = '\\r\\n\\f',
  WSP = '[' + HSP + VSP + ']',

  CFG = {
    // extensions
    operators: '[~*^$|]=|=',
    combinators: '[\\x20\\t>+~](?=[^>+~])'
  },

  NOT = {
    // not enclosed in double/single/parens/square
    double_enc: '(?=(?:[^"]*["][^"]*["])*[^"]*$)',
    single_enc: "(?=(?:[^']*['][^']*['])*[^']*$)",
    parens_enc: '(?![^\\x28]*\\x29)',
    square_enc: '(?![^\\x5b]*\\x5d)'
  },

  REX = {
    // regular expressions
    HasEscapes: RegExp('\\\\'),
    HexNumbers: RegExp('^[0-9a-fA-F]'),
    EscOrQuote: RegExp('^\\\\|[\\x22\\x27]'),
    RegExpChar: RegExp('(?!\\\\)[\\\\^$.,*+?()[\\]{}|\\/]', 'g'),
    TrimSpaces: RegExp('^' + WSP + '+|' + WSP + '+$', 'g'),
    SplitGroup: RegExp('(\\([^)]*\\)|\\[[^[]*\\]|\\\\.|[^,])+', 'g'),
    CommaGroup: RegExp('(\\s*,\\s*)' + NOT.square_enc + NOT.parens_enc, 'g'),
    FixEscapes: RegExp('\\\\([0-9a-fA-F]{1,6}' + WSP + '?|.)|([\\x22\\x27])', 'g'),
    CombineWSP: RegExp('[\\n\\r\\f\\x20]+' + NOT.single_enc + NOT.double_enc, 'g'),
    TabCharWSP: RegExp('(\\x20?\\t+\\x20?)' + NOT.single_enc + NOT.double_enc, 'g'),
    PseudosWSP: RegExp('\\s+([-+])\\s+' + NOT.square_enc, 'g'),
    LogicalPfx: RegExp('^:(is|where|matches|not|has)\\x28', 'i')
  },

  STD = {
    combinator: RegExp('\\s?([>+~])\\s?', 'g'),
    apimethods: RegExp('^(?:\\w+|\\*)\\|'),
    namespaces: RegExp('(\\*|\\w+)\\|[\\w-]+')
  },

  GROUPS = {
    // pseudo-classes requiring parameters
    linguistic: '(dir|lang)(?:\\x28\\s?([-\\w]{2,})\\s?(?:\\x29|$))',
    logicalsel: '(is|where|matches|not|has)(?:\\x28\\s?(' + '[^()]*|.*' + ')\\s?(?:\\x29|$))',
    treestruct: '(nth(?:-last)?(?:-child|-of\\-type))(?:\\x28\\s?(even|odd|(?:[-+]?\\d*)(?:n\\s?[-+]?\\s?\\d*)?)\\s?(?:\\x29|$))',
    // pseudo-classes not requiring parameters
    locationpc: '(any\\-link|link|visited|target|defined)\\b',
    useraction: '(hover|active|focus\\-within|focus\\-visible|focus)\\b',
    structural: '(scope|root|empty|(?:(?:first|last|only)(?:-child|\\-of\\-type)))\\b',
    inputstate: '(enabled|disabled|read\\-only|read\\-write|placeholder\\-shown|default|autofill|-webkit\\-autofill)\\b',
    inputvalue: '(checked|indeterminate|required|optional|valid|invalid|in\\-range|out\\-of\\-range)\\b',
    // pseudo-classes not requiring parameters and describing functional state
    rsrc_state: '(playing|paused|seeking|buffering|stalled|muted|volume\\-locked)\\b',
    disp_state: '(open|closed|modal|fullscreen|picture\\-in\\-picture|popover\\-open|popover)\\b',
    time_state: '(current|past|future)\\b',
    // pseudo-elements starting with single colon (:)
    pseudo_sng: '(after|before|first\\-letter|first\\-line)\\b',
    // pseudo-elements starting with double colon (::)
    pseudo_dbl: ':(after|before|first\\-letter|first\\-line|selection|placeholder|-webkit-[-a-zA-Z0-9]{2,})\\b'
  },

  Patterns = {
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
   universal: RegExp('^(\\*)(.*)'),
   namespace: RegExp('^(\\*|[\\w-]+)?\\|(.*)')
  },

  // regular expression to better aproximate
  // detection of RTL languages (like Arabic)
  RTL = RegExp('^(?:' +
    '[\\u0627-\\u064a]|' +
    '[\\u0591-\\u08ff]|' +
    '[\\ufb1d-\\ufdfd]|' +
    '[\\ufe70-\\ufefc])+$'),

  // elements that can carry a hyperlink, see isLink()
  reLinkName = RegExp('^(?:a|area)$', 'i'),

  // emulate firefox error strings
  qsNotArgs = 'Not enough arguments',
  qsInvalid = ' is not a valid selector',
  errors = 0,

  // placeholder for global regexp
  reOptimizer,
  reValidator,

  // special handling configuration flags
  Config = {
    IDS_DUPES: true,
    FORGIVING: true,
    NODE_LIST: false,
    LOGERRORS: true,
    USR_EVENT: true,
    VERBOSITY: true
  },

  NAMESPACE,
  QUIRKS_MODE,
  HTML_DOCUMENT,

  ATTR_STD_OPS = {
    '=': 1, '^=': 1, '$=': 1, '|=': 1, '*=': 1, '~=': 1
  },

  HTML_TABLE = {
    'accept': 1, 'accept-charset': 1, 'align': 1, 'alink': 1, 'axis': 1,
    'bgcolor': 1, 'charset': 1, 'checked': 1, 'clear': 1, 'codetype': 1, 'color': 1,
    'compact': 1, 'declare': 1, 'defer': 1, 'dir': 1, 'direction': 1, 'disabled': 1,
    'enctype': 1, 'face': 1, 'frame': 1, 'hreflang': 1, 'http-equiv': 1, 'lang': 1,
    'language': 1, 'link': 1, 'media': 1, 'method': 1, 'multiple': 1, 'nohref': 1,
    'noresize': 1, 'noshade': 1, 'nowrap': 1, 'readonly': 1, 'rel': 1, 'rev': 1,
    'rules': 1, 'scope': 1, 'scrolling': 1, 'selected': 1, 'shape': 1, 'target': 1,
    'text': 1, 'type': 1, 'valign': 1, 'valuetype': 1, 'vlink': 1
  },

  Combinators = { },

  Selectors = { },

  Operators = {
     '=': { p1: '^',
            p2: '$',
            p3: 'true' },
    '^=': { p1: '^',
            p2: '',
            p3: 'true' },
    '$=': { p1: '',
            p2: '$',
            p3: 'true' },
    '*=': { p1: '',
            p2: '',
            p3: 'true' },
    '|=': { p1: '^',
            p2: '(-|$)',
            p3: 'true' },
    '~=': { p1: '(^|\\s)',
            p2: '(\\s|$)',
            p3: 'true' }
  },

  concatCall =
    function(nodes, callback) {
      var i = 0, l = nodes.length, list = Array(l);
      while (l > i) {
        if (false === callback(list[i] = nodes[i])) {
          list.length = i + 1;
          break;
        }
        ++i;
      }
      return list;
    },

  concatList =
    function(list, nodes) {
      var i = -1, l = nodes.length;
      while (l--) { list[list.length] = nodes[++i]; }
      return list;
    },

  // Entry and estimated byte budgets for plans. UTF-16 keys, generated code,
  // bound subplans and metadata are charged; VM object/code overhead varies.
  CACHE_LIMIT = 1000,
  CACHE_BYTES = 2 * 1024 * 1024,

  // ES5 bounded LRU cache. It stores query plans (compiled resolvers),
  // never DOM result sets. A prefixed dictionary avoids user-key collisions
  // and a doubly linked list keeps the least-recently-used entry at the head.
  createCache = function(limit, byteLimit) {
    var cache = { }, head = null, tail = null, size = 0, bytes = 0,
      prefix = '\x01', has = function(key) {
        return Object.prototype.hasOwnProperty.call(cache, prefix + key);
      }, unlink = function(entry) {
        entry.prev ? entry.prev.next = entry.next : head = entry.next;
        entry.next ? entry.next.prev = entry.prev : tail = entry.prev;
      }, link = function(entry) {
        entry.prev = tail;
        entry.next = null;
        tail ? tail.next = entry : head = entry;
        tail = entry;
      }, promote = function(entry) {
        if (entry !== tail) {
          unlink(entry);
          link(entry);
        }
      }, remove = function(entry) {
        unlink(entry);
        delete cache[entry.key];
        --size;
        bytes -= entry.bytes;
      };

    limit || (limit = CACHE_LIMIT);
    byteLimit || (byteLimit = CACHE_BYTES);

    return {
      clear: function() {
        cache = { };
        head = tail = null;
        size = bytes = 0;
      },
      get: function(key) {
        var entry;
        if (tail && tail.key === prefix + key) { return tail.value; }
        if (!has(key)) return undefined;
        entry = cache[prefix + key];
        promote(entry);
        return entry.value;
      },
      has: function(key) {
        return has(key);
      },
      set: function(key, value, weight) {
        var entry, entryKey = prefix + key, cost = entryKey.length * 2 + (weight || value && value.cacheSize || 64);

        if (cost > byteLimit) {
          if (has(key)) { remove(cache[entryKey]); }
          return value;
        }

        if (has(key)) {
          entry = cache[entryKey];
          bytes -= entry.bytes;
          entry.value = value;
          entry.bytes = cost;
          bytes += cost;
          promote(entry);
        } else {
          size >= limit && remove(head);
          entry = { key: entryKey, value: value, bytes: cost, prev: null, next: null };
          cache[entryKey] = entry;
          link(entry);
          ++size;
          bytes += cost;
        }
        while (bytes > byteLimit) { remove(head); }
        return value;
      },
      size: function() {
        return size;
      },
      bytes: function() {
        return bytes;
      },
      byteLimit: function() {
        return byteLimit;
      }
    };
  },

  // only define the toNodeList helper if explicitly enabled in Config,
  // a safety measure for headless hosts missing feature/implementation
  toNodeList =
    Config.NODE_LIST == false ?
    function(x) { return x; } :
    function() {
      // create a DocumentFragment
      var emptyNL = doc.createDocumentFragment().childNodes;

      // this is returned from a self-executing function so that
      // the DocumentFragment isn't repeatedly created
      return function(nodeArray) {
        // check if it is already a nodelist
        if (isInstanceOf(nodeArray)) return nodeArray;

        // if it's a single element, wrap it in a classic array
        if (!Array.isArray(nodeArray)) nodeArray = [nodeArray];

        // base an object on emptyNL
        var fakeNL = Object.create(emptyNL, {
          'length': {
            value: nodeArray.length, enumerable: false
          },
          'item': {
            'value': function(i) {
              return this[+i || 0];
            },
            enumerable: false
          }
        });

        // copy the array elemnts
        nodeArray.forEach(function (v, i) { fakeNL[i] = v; });

        // return an object pretending to be a NodeList.
        return fakeNL;
      };
    }(),

  isInstanceOf =
    function(nodes) {
      return nodes instanceof global.NodeList;
    },

  documentOrder =
    function(a, b) {
      if (!hasDupes && a === b) {
        hasDupes = true;
        return 0;
      }
      return a.compareDocumentPosition(b) & 4 ? -1 : 1;
    },

  hasDupes = false,

  unique =
    function(nodes) {
      var i = 0, j = -1, l = nodes.length + 1, list = [ ];
      while (--l) {
        if (nodes[i++] === nodes[i]) continue;
        list[++j] = nodes[i - 1];
      }
      hasDupes = false;
      return list;
    },

  switchContext =
    function(context, force) {
      var oldDoc = doc, oldHTML = HTML_DOCUMENT, oldQuirks = QUIRKS_MODE,
        oldNamespace = NAMESPACE, oldPrefix = root && root.prefix;
      doc = context.ownerDocument || context;
      if (force || oldDoc !== doc || root !== doc.documentElement) {
        // force a new check for each document change
        // performed before the next select operation
        root = doc.documentElement;
        HTML_DOCUMENT = isHTML(doc);
        QUIRKS_MODE = HTML_DOCUMENT &&
          doc.compatMode.indexOf('CSS') < 0;
        NAMESPACE = root && root.namespaceURI;
        Snapshot.doc = doc;
        Snapshot.root = root;
        // Compiled guards capture document modes and namespace resolution.
        // Plans can be shared across documents only while those facts agree.
        if (!force && (oldHTML !== HTML_DOCUMENT || oldQuirks !== QUIRKS_MODE ||
          oldNamespace !== NAMESPACE || oldPrefix !== (root && root.prefix))) {
          clearResolverCaches();
        }
      }
      return (Snapshot.from = context);
    },

  queryDepth = 0,

  enterContext =
    function(context) {
      var previous = queryDepth ? Snapshot.from : null;
      ++queryDepth;
      if (lastContext !== context || root !== (context.ownerDocument || context).documentElement) {
        lastContext = switchContext(context);
      }
      return previous;
    },

  leaveContext =
    function(previous) {
      --queryDepth;
      if (previous) {
        if (doc !== (previous.ownerDocument || previous) || root !== doc.documentElement) {
          switchContext(previous);
        } else { Snapshot.from = previous; }
        lastContext = previous;
      }
    },

  // convert single codepoint to UTF-16 encoding
  codePointToUTF16 =
    function(codePoint) {
      // out of range, use replacement character
      if (codePoint < 1 || codePoint > 0x10ffff ||
        (codePoint > 0xd7ff && codePoint < 0xe000)) {
        return '\\ufffd';
      }
      // javascript strings are UTF-16 encoded
      if (codePoint < 0x10000) {
        var lowHex = '000' + codePoint.toString(16);
        return '\\u' + lowHex.substr(lowHex.length - 4);
      }
      // supplementary high + low surrogates
      return '\\u' + (((codePoint - 0x10000) >> 0x0a) + 0xd800).toString(16) +
             '\\u' + (((codePoint - 0x10000) % 0x400) + 0xdc00).toString(16);
    },

  // convert single codepoint to string
  stringFromCodePoint =
    function(codePoint) {
      // out of range, use replacement character
      if (codePoint < 1 || codePoint > 0x10ffff ||
        (codePoint > 0xd7ff && codePoint < 0xe000)) {
        return '\ufffd';
      }
      if (codePoint < 0x10000) {
        return String.fromCharCode(codePoint);
      }
      return String.fromCodePoint ?
        String.fromCodePoint(codePoint) :
        String.fromCharCode(
          ((codePoint - 0x10000) >> 0x0a) + 0xd800,
          ((codePoint - 0x10000) % 0x400) + 0xdc00);
    },

  // convert escape sequence in a CSS string or identifier
  // to javascript string with javascript escape sequences
  escapeIdentifier =
    function(str) {
      return REX.HasEscapes.test(str) ?
        str.replace(REX.FixEscapes,
          function(substring, p1, p2) {
            // unescaped " or '
            return p2 ? '\\' + p2 :
              // javascript strings are UTF-16 encoded
              REX.HexNumbers.test(p1) ? codePointToUTF16(parseInt(p1, 16)) :
              // \' \"
              REX.EscOrQuote.test(p1) ? substring :
              // \g \h \. \# etc
              p1;
          }
        ) : str;
    },

  // convert escape sequence in a CSS string or identifier
  // to javascript string with characters representations
  unescapeIdentifier =
    function(str) {
      return REX.HasEscapes.test(str) ?
        str.replace(REX.FixEscapes,
          function(substring, p1, p2) {
            // unescaped " or '
            return p2 ? p2 :
              // javascript strings are UTF-16 encoded
              REX.HexNumbers.test(p1) ? stringFromCodePoint(parseInt(p1, 16)) :
              // \' \"
              REX.EscOrQuote.test(p1) ? p1 :
              // \g \h \. \# etc
              p1;
          }
        ) : str;
    },

  // split ':is(', ':where(', ':matches(', ':not(' and ':has(' into their
  // selector list argument and the rest of the selector. The argument can
  // nest parentheses and quote them, which a single regular expression
  // cannot track, so the closing parenthesis is located by scanning. An
  // argument left unclosed is closed by EOF, as the CSS Syntax parser does
  // with any open construct. Returns a match-like array so that callers can
  // pop() the remainder the same way they do with a RegExp match.
  splitList =
    function(text) {
      var chr, depth = 0, escaped, i = 0, l = text.length,
      quote = '', start = 0, list = [ ];

      for (; l > i; ++i) {
        chr = text.charAt(i);
        if (escaped) { escaped = false; continue; }
        if (chr == '\\') { escaped = true; }
        else if (quote) { if (chr == quote) { quote = ''; } }
        else if (chr == '\x22' || chr == '\x27') { quote = chr; }
        else if (chr == '\x28' || chr == '\x5b') { ++depth; }
        else if (chr == '\x29' || chr == '\x5d') { --depth; }
        else if (chr == ',' && depth === 0) {
          list[list.length] = text.slice(start, i).replace(REX.TrimSpaces, '');
          start = i + 1;
        }
      }
      list[list.length] = text.slice(start).replace(REX.TrimSpaces, '');
      return list;
    },

  matchLogical =
    function(selector, prefix) {
      var chr, close, escaped, depth = 1, i, l, quote = '',
      match = selector.match(prefix || REX.LogicalPfx);

      if (!match) { return null; }

      for (i = match[0].length, l = selector.length; l > i; ++i) {
        chr = selector.charAt(i);
        if (escaped) { escaped = false; continue; }
        if (chr == '\\') { escaped = true; }
        else if (quote) { if (chr == quote) { quote = ''; } }
        else if (chr == '\x22' || chr == '\x27') { quote = chr; }
        else if (chr == '\x28') { ++depth; }
        else if (chr == '\x29' && --depth === 0) { break; }
      }

      // i is the closing parenthesis, or the EOF that stands in for it
      close = l > i ? i + 1 : i;

      return [
        selector.slice(0, close),
        match[1],
        selector.slice(match[0].length, i).replace(REX.TrimSpaces, ''),
        selector.slice(close)
      ];
    },

  // Validate logical arguments even when the query has no candidates.
  validateLogical =
    function(argument, relative) {
      var key = (relative ? '1:' : '0:') + argument;
      if (logicalValidators.get(key)) { return true; }
      var previousErrors = errors, selectVars = S_VARS,
        matchVars = M_VARS, nodeVars = N_VARS,
        list = splitList(argument), parsed, i, j, previousCompilation = compilation;
      compilation = null;
      S_VARS = [];
      M_VARS = [];
      N_VARS = [];
      try {
        for (i = 0; i < list.length; ++i) {
          if (!list[i]) {
            emit(qsInvalid);
            return false;
          }
          parsed = parse(relative ? '* ' + list[i] : list[i], false);
          if (!parsed) {
            return false;
          }
          for (j = 0; j < parsed.length; ++j) {
            if (!selectorInfo(parsed[j]).pure) {
              compileSelector(parsed[j], '', relative, false);
            }
          }
        }
        if (errors == previousErrors) {
          logicalValidators.set(key, true);
          return true;
        }
        return false;
      } finally {
        S_VARS = selectVars;
        M_VARS = matchVars;
        N_VARS = nodeVars;
        compilation = previousCompilation;
      }
    },

  // Invalid nested branches disappear only inside forgiving logical lists.
  prepareForgivingHas =
    function(logical) {
      var items = splitList(logical[2]), kept = [], item, i;
      for (i = 0; i < items.length; ++i) {
        item = prepareHas(items[i]);
        if (item !== null) {
          kept.push(item);
        }
      }
      return ':' + logical[1] + '(' + (kept.join(',') || ':not(*)') + ')';
    },

  prepareHas =
    function(text) {
      var i = 0, quote = '', bracket = 0, chr, logical,
        output = '', start = 0;
      for (; i < text.length; ++i) {
        chr = text.charAt(i);
        if (chr == '\\') {
          ++i;
          continue;
        }
        if (quote) {
          if (chr == quote) {
            quote = '';
          }
          continue;
        }
        if (chr == '"' || chr == "'") {
          quote = chr;
          continue;
        }
        if (chr == '[') {
          ++bracket;
          continue;
        }
        if (chr == ']') {
          --bracket;
          continue;
        }
        if (bracket || chr != ':') {
          continue;
        }
        if (/^:(?:has\(|:|(?:before|after|first-line|first-letter)(?![-\w]))/i.test(text.slice(i))) {
          return null;
        }
        if (Config.FORGIVING && (logical = matchLogical(text.slice(i), /^:(is|where)\(/i))) {
          output += text.slice(start, i) + prepareForgivingHas(logical);
          i += logical[0].length - 1;
          start = i + 1;
        }
      }
      return output + text.slice(start);
    },

  method = {
    '#': 'getElementById',
    '*': 'getElementsByTagName',
    '|': 'getElementsByTagNameNS',
    '.': 'getElementsByClassName'
    },

  compat = {
    '#': (c, n) => (e, f) => byId(n, c),
    '*': (c, n) => (e, f) => byTag(n, c),
    '|': (c, n) => (e, f) => byTagNS(n, c),
    '.': (c, n) => (e, f) => byClass(n, c),
    },

  // find duplicate ids using iterative walk
  byIdRaw =
    function(id, context) {
      var node = context, nodes = [ ], next = node.firstElementChild;
      while ((node = next)) {
        node.id == id && (nodes[nodes.length] = node);
        if ((next = node.firstElementChild || node.nextElementSibling)) continue;
        while (!next && (node = node.parentElement) && node !== context) {
          next = node.nextElementSibling;
        }
      }
      return nodes;
    },

  // context agnostic getElementById
  byId =
    function(id, context) {
      var e, i, l, nodes, api = method['#'];

      // duplicates id allowed
      if (Config.IDS_DUPES === false) {
        if (api in context) {
          return (e = context[api](id)) ? [ e ] : none;
        }
      } else {
        if ('all' in context) {
          if ((e = context.all[id])) {
            if (e.nodeType == 1) return e.getAttribute('id') != id ? [ ] : [ e ];
            else if (id == 'length') return (e = context[api](id)) ? [ e ] : none;
            for (i = 0, l = e.length, nodes = [ ]; l > i; ++i) {
              if (e[i].id == id) nodes[nodes.length] = e[i];
            }
            return nodes && nodes.length ? nodes : [ nodes ];
          } else return none;
        }
      }

      return byIdRaw(id, context);
    },

  // wrapped up namespaced TagName api calls
  byTagNS =
    function(context, tag) {
      return byTag(tag, context);
  },

  // context agnostic getElementsByTagName
  tagCollection =
    function(context, tag) {
      return !HTML_DOCUMENT && context.getElementsByTagNameNS ?
        context.getElementsByTagNameNS('*', tag) : context.getElementsByTagName(tag);
    },

  byTag =
    function(tag, context) {
      var e, nodes, api = method['*'];
      // DOCUMENT_NODE (9) & ELEMENT_NODE (1)
      if (api in context) {
        return slice.call(tagCollection(context, tag));
      } else {
        // DOCUMENT_FRAGMENT_NODE (11)
        if ((e = context.firstElementChild)) {
          if (!(e.nextElementSibling || tag == '*' || tagMatches(e, tag))) {
            return slice.call(tagCollection(e, tag));
          } else {
            nodes = [ ];
            do {
              if (tag == '*' || tagMatches(e, tag)) nodes[nodes.length] = e;
              concatList(nodes, tagCollection(e, tag));
            } while ((e = e.nextElementSibling));
          }
        } else nodes = none;
      }
      return !Config.NODE_LIST ?
        nodes : isInstanceOf(nodes) ?
        nodes : toNodeList(nodes);
    },

  // context agnostic getElementsByClassName
  byClass =
    function(cls, context) {
      var e, nodes, api = method['.'], reCls;
      // DOCUMENT_NODE (9) & ELEMENT_NODE (1)
      if (api in context) {
        return slice.call(context[api](cls));
      } else {
        // DOCUMENT_FRAGMENT_NODE (11)
        if ((e = context.firstElementChild)) {
          reCls = QUIRKS_MODE ? RegExp('(^|\\s)' + cls + '(\\s|$)', 'i') : null;
          if (!(e.nextElementSibling || (reCls ? reCls.test(classOf(e)) : hasClassNames(e, cls)))) {
            return slice.call(e[api](cls));
          } else {
            nodes = [ ];
            do {
              if (reCls ? reCls.test(classOf(e)) : hasClassNames(e, cls)) nodes[nodes.length] = e;
              concatList(nodes, e[api](cls));
            } while ((e = e.nextElementSibling));
          }
        } else nodes = none;
      }
      return !Config.NODE_LIST ?
        nodes : isInstanceof(nodes) ?
        nodes : toNodeList(nodes);
    },

  // Read HTML and SVG class names through the same string path.
  classOf =
    function(e) {
      var value = e.className;
      return typeof value == 'string' ? value : value && typeof value.baseVal == 'string' ? value.baseVal : '';
    },

  // Match one standards-mode class token without a per-candidate RegExp.
  hasClass =
    function(e, name) {
      return hasClassValue(classOf(e), name);
    },

  hasClassValue =
    function(value, name) {
      var offset = -1, before, after;
      if (!name || /[\t\n\f\r ]/.test(name)) return false;
      while ((offset = value.indexOf(name, offset + 1)) >= 0) {
        before = offset ? value.charCodeAt(offset - 1) : 32;
        after = offset + name.length < value.length ? value.charCodeAt(offset + name.length) : 32;
        if ((before == 32 || before == 9 || before == 10 || before == 12 || before == 13) &&
            (after == 32 || after == 9 || after == 10 || after == 12 || after == 13)) return true;
      }
      return false;
    },

  // getElementsByClassName accepts multiple whitespace-separated tokens.
  hasClassNames =
    function(e, names) {
      var tokens = names.match(/[^\t\n\f\r ]+/g) || [], i = 0;
      for (; i < tokens.length; ++i) if (!hasClass(e, tokens[i])) return false;
      return tokens.length > 0;
    },

  // namespace aware hasAttribute
  // helper for XML/XHTML documents
  hasAttributeNS =
    function(e, name) {
      var i, l, attr = e.getAttributeNames();
      name = RegExp(':?' + name + '$', HTML_DOCUMENT ? 'i' : '');
      for (i = 0, l = attr.length; l > i; ++i) {
        if (name.test(attr[i])) return true;
      }
      return false;
    },

  // fast resolver for the :nth-child() and :nth-last-child() pseudo-classes
  nthNeedsCache =
    function(formula) {
      formula = formula.replace(/\s/g, '').toLowerCase();
      return formula != 'n' && !(/^[+-]?\d+$/.test(formula) && +formula <= 8);
    },

  // Small fixed positions stop as soon as the position is impossible. They
  // need no sibling arrays, parent cache, or query cleanup.
  nthWithin =
    function(element, last, typed, limit) {
      var count = 1, node = element, step = last ? 'nextElementSibling' : 'previousElementSibling';
      while ((node = node[step])) {
        if (!typed || node.localName === element.localName && node.namespaceURI === element.namespaceURI) {
          if (++count > limit) { break; }
        }
      }
      return count;
    },

  // Stream each parent's siblings once per direction. Typed scans maintain
  // namespace/local-name counters together, so interleaved element types do
  // not restart the walk. Weak maps make irregular lookups constant-time.
  createNthCache =
    function(typed) {
      var parents, lastParent, lastEntry;
      return function(element, direction) {
        if (direction == 2) {
          parents = lastParent = lastEntry = null;
          return -1;
        }
        if (Snapshot.nthUncachedDepth) { parents = lastParent = lastEntry = null; }
        var parent = element.parentNode || element, entry, stream, node, key,
          backward = !!direction, step = backward ? 'previousElementSibling' : 'nextElementSibling', position;
        if (lastParent === parent) { entry = lastEntry; }
        else {
          parents || (parents = new WeakMap());
          entry = parents.get(parent);
          if (!entry) { entry = { forward: null, backward: null }; parents.set(parent, entry); }
          lastParent = parent; lastEntry = entry;
        }
        key = backward ? 'backward' : 'forward';
        stream = entry[key];
        if (!stream) {
          stream = entry[key] = { next: element.parentNode ? parent[backward ? 'lastElementChild' : 'firstElementChild'] : element,
            positions: new WeakMap(), counts: Object.create(null), count: 0, last: null, position: 0 };
        }
        if (stream.last === element) { return stream.position; }
        if (stream.next !== element) {
          position = stream.positions.get(element);
          if (position !== undefined) { return position; }
        }
        while ((node = stream.next)) {
          stream.next = node[step];
          if (typed) {
            key = (node.namespaceURI || '') + '\x00' + node.localName;
            position = stream.counts[key] = (stream.counts[key] || 0) + 1;
          } else { position = ++stream.count; }
          stream.positions.set(node, position);
          stream.last = node; stream.position = position;
          if (node === element) { return position; }
        }
        return -1;
      };
    },

  nthElement = createNthCache(false),
  nthOfType = createNthCache(true),

  clearNth =
    function() {
      nthElement(null, 2);
      nthOfType(null, 2);
    },

  checkValidity =
    function(element) {
      try { return element.checkValidity(); }
      finally { clearNth(); }
    },

  // check if the document type is HTML
  isHTML =
    function(node) {
      var doc = node.ownerDocument || node;
      return doc.nodeType == 9 &&
        // contentType not in IE <= 11
        'contentType' in doc ?
          doc.contentType.indexOf('/html') > 0 :
          doc.createElement('DiV').localName == 'div';
    },

  // check if node content is editable
  // Whether an element is defined, which every built-in element is. Only
  // a custom element can be undefined: one whose name carries a hyphen, or a
  // built-in carrying an 'is' attribute, and in both cases only until a
  // definition exists and the element has been upgraded to it.
  // https://dom.spec.whatwg.org/#concept-element-defined
  isDefined =
    function(element) {
      var custom, name = element.localName, registry, view;

      if (element.namespaceURI !== 'http://www.w3.org/1999/xhtml') {
        return true;
      }

      if (name.indexOf('-') < 0) {
        if (!element.hasAttribute('is')) { return true; }
        name = element.getAttribute('is') || name;
      }

      view = element.ownerDocument.defaultView;
      registry = view && view.customElements;
      if (!registry || !registry.get) { return false; }
      custom = registry.get(name);
      return !!custom && element instanceof custom;
    },

  isRequired =
    function(node) {
      return !!node.required &&
        (/^(select|textarea)$/.test(node.localName) ||
        (node.localName == 'input' &&
        !/^(hidden|range|color|button|submit|reset|image)$/.test(node.type)));
    },

  isContentEditable =
    function(node) {
      var attrValue = 'inherit';
      if (node.hasAttribute('contenteditable')) {
        attrValue = node.getAttribute('contenteditable');
      }
      switch (attrValue) {
        case '':
        case 'plaintext-only':
        case 'true':
          return true;
        case 'false':
          return false;
        default:
          if (node.parentNode && node.parentNode.nodeType === 1) {
            return isContentEditable(node.parentNode);
          }
          return false;
      }
    },

  // return node if node is focusable
  // or false if node isn't focusable
  // Whether a form control is disabled, which is not only its own
  // property: a control inside a disabled fieldset is disabled too, unless it
  // sits in that fieldset's first legend child.
  // https://html.spec.whatwg.org/#enabling-and-disabling-form-controls:-the-disabled-attribute
  isDisabled =
    function(element) {
      var legend, name = element.localName, node;

      if (element.disabled === true) { return true; }

      // an optgroup is disabled by its own attribute and nothing else; an
      // option is also disabled by the optgroup it is a child of
      if (name == 'optgroup') { return false; }
      if (name == 'option') {
        node = element.parentElement;
        return !!node && node.localName == 'optgroup' && node.disabled === true;
      }

      // any disabled fieldset above it, unless it sits in that fieldset's
      // first legend child, which excuses that fieldset and no other
      node = element.parentElement;
      while (node) {
        if (node.localName == 'fieldset' && node.disabled === true) {
          legend = node.firstElementChild;
          while (legend && legend.localName != 'legend') {
            legend = legend.nextElementSibling;
          }
          if (!(legend && legend.contains(element))) { return true; }
        }
        node = node.parentElement;
      }

      return false;
    },

  isFocusable =
    function(node) {
      var doc = node.ownerDocument;
       if (node.contentDocument&&node.localName== 'iframe') { return false; }
       if (doc.hasFocus() && node === doc.activeElement) {
        if (node.type || node.href || typeof node.tabIndex == 'number') {
          return node;
        }
      }
      return false;
    },

  // use the native selector state when it is available; when NWSAPI has
  // installed itself, _matches retains the native implementation
  matchesNative =
    function(node, selector) {
      var matcher = _matches || NATIVE_MATCHES;
      // the captured matcher can still be a host wrapper that delegates back
      // to this engine, in which case the outer answer is the only one
      if (!matcher || matchingNative) { return false; }
      try {
        matchingNative = true;
        return matcher.call(node, selector);
      } catch (e) {
        return false;
      } finally {
        matchingNative = false;
      }
    },

  // set while the captured host matcher runs, see NATIVE_MATCHES
  matchingNative = false,

  // :open and :closed have a portable DOM state for details and dialog.
  // Native matching extends support to host-language states such as pickers.
  isOpen =
    function(node) {
      return (/^(details|dialog)$/i.test(node.localName) && node.open === true) ||
        matchesNative(node, ':open');
    },

  isClosed =
    function(node) {
      return (/^(details|dialog)$/i.test(node.localName) && node.open === false) ||
        matchesNative(node, ':closed');
    },

  isFullscreen =
    function(node) {
      var doc = node.ownerDocument;
      return matchesNative(node, ':fullscreen') || !!(doc && (
        doc.fullscreenElement === node ||
        doc.webkitFullscreenElement === node ||
        doc.mozFullScreenElement === node ||
        doc.msFullscreenElement === node));
    },

  // A modal dialog cannot be distinguished from dialog.show() without the
  // native :modal state. Fullscreen is explicitly modal per the WPT suite.
  isModal =
    function(node) {
      return matchesNative(node, ':modal') || isFullscreen(node);
    },

  isPictureInPicture =
    function(node) {
      var doc = node.ownerDocument;
      return matchesNative(node, ':picture-in-picture') || !!(doc && (
        doc.pictureInPictureElement === node ||
        node.webkitPresentationMode === 'picture-in-picture'));
    },

  // The popover attribute declares capability, not the showing state. The
  // native pseudo-class is therefore required until an explicit state API is
  // available. :popover is retained as an alias for existing callers.
  isPopoverOpen =
    function(node) {
      return node.hasAttribute('popover') && matchesNative(node, ':popover-open');
    },

  // ':link', ':any-link' and ':visited' share this test
  isLink =
    function(node) {
      return reLinkName.test(node.localName) && node.hasAttribute('href');
    },

  // check media resources is playing
  isPlaying =
    function(media) {
      // for <audio>, <video>, <source> and <track> elements
      var parent = media instanceof global.HTMLMediaElement ? null : media.parentElement;
      return (
        !!( media &&  media.currentTime > 0 &&  !media.paused &&  !media.ended &&  media.readyState > 2) ||
        !!(parent && parent.currentTime > 0 && !parent.paused && !parent.ended && parent.readyState > 2));
    },

  clearResolverCaches =
    function() {
      matchLambdas.clear();
      selectLambdas.clear();
      matchResolvers.clear();
      selectResolvers.clear();
      hasResolvers.clear();
      firstResolvers.clear();
      forgivingResolvers.clear();
      selectorInfos.clear();
      logicalValidators.clear();
      parsedSelectors.clear();
    },

  // configure the engine to use special handling
  configure =
    function(option, clear) {
      if (typeof option == 'string') { return !!Config[option]; }
      if (typeof option != 'object') { return Config; }
      for (var i in option) {
        // Compiled selectors capture forgiving and error-reporting behavior.
        if ((i == 'FORGIVING' || i == 'VERBOSITY') && Config[i] !== !!option[i]) {
          clear = true;
        }
        Config[i] = !!option[i];
      }
      // clear lambda cache
      if (clear) { clearResolverCaches(); }
      setIdentifierSyntax();
      return true;
    },

  // centralized error and exceptions handling
  emit =
    function(message, proto) {
      var err;
      ++errors;
      if (Config.VERBOSITY) {
        if (proto) {
          err = new proto(message);
        } else {
          err = new global.DOMException(message, 'SyntaxError');
        }
        throw err;
      }
      if (Config.LOGERRORS && console && console.log) {
        console.log(message);
      }
    },

  // execute the engine initialization code
  initialize =
    function(doc) {
      setIdentifierSyntax();
      lastContext = switchContext(doc, true);
    },

  // build validation regexps used by the engine
  setIdentifierSyntax =
    function() {

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

      var

      // non-ascii chars
      noascii = '[^\\x00-\\x9f]',
      // unicode chars
      unicode = '\\\\[0-9a-fA-F]{1,6}',

      // can start with single/double dash
      // but it can not start with a digit
      identifier = '(?:-|--|' + unicode + '[' + HSP + ']' +
                    '?|\\\\[^' + VSP + ']|' + noascii + '|[\\w-])+',

      pseudonames = '[-\\w]+',
      pseudoparms = '(?:[-+]?\\d*)(?:n\\s?[-+]?\\s?\\d*)',
      doublequote = '"[^"\\\\' + VSP + ']*(?:\\\\.[^"\\\\' + VSP + ']*)*(?:"|$)',
      singlequote = "'[^'\\\\" + VSP + "]*(?:\\\\.[^'\\\\" + VSP + "]*)*(?:'|$)",

      attrparser = identifier + '|' + doublequote + '|' + singlequote,

      attrvalues = '([\\x22\\x27]?)((?!\\3)*|(?:\\\\?.)*?)(?:\\3|$)',

      attributes =
        '\\[' +
          // attribute presence
          '(?:\\*\\|)?' +
          WSP + '?' +
          '(' + identifier + '(?::' + identifier + ')?)' +
          WSP + '?' +
          '(?:' +
            '(' + CFG.operators + ')' + WSP + '?' +
            '(?:' + attrparser + ')' +
          ')?' +
          // attribute case sensitivity
          '(?:' + WSP + '?\\b([iIsS]))?' + WSP + '?' +
        '(?:\\]|$)',

      attrmatcher = attributes.replace(attrparser, attrvalues),

      pseudoclass =
        '(?:\\x28' + WSP + '*' +
          '(?:' + pseudoparms + '?)?|' +
          // universal * &
          // namespace *|*
          '(?:\\*\\||\\*)|' +
          '(?:' +
            '(?::' + pseudonames +
              '(?:\\x28' + pseudoparms + '?(?:\\x29|$))?|' +
            ')|' +
            '(?:[.#]?' + identifier + ')|' +
            '(?:' + attributes + ')' +
          ')+|' +
          // the combinator is only recognized, not consumed: taking the
          // character after it swallows the '[' of a following attribute
          // selector, which then cannot be parsed
          '(?:' + WSP + '?[>+~](?=[^>+~])' + WSP + '?)|' +
          '(?:' + WSP + '?,' + WSP + '?)|' +
          '(?:' + WSP + '?)|' +
          '(?:\\x29|$)' +
        ')*',

      standardValidator =
        '(?=' + WSP + '?[^>+~(){}<>])' +
        '(?:' +
          // universal * &
          // namespace *|*
          '(?:\\*\\||\\*)|' +
          '(?:[.#]?' + identifier + ')+|' +
          '(?:' + attributes + ')+|' +
          '(?:::?' + pseudonames + pseudoclass + ')|' +
          '(?:' + WSP + '?' + CFG.combinators + WSP + '?)|' +
          '(?:' + WSP + '?,' + WSP + '?)|' +
          '(?:' + WSP + '?)' +
        ')+';

      // the following global RE is used to return the
      // deepest localName in selector strings and then
      // use it to retrieve all possible matching nodes
      // that will be filtered by compiled resolvers
      reOptimizer = RegExp(
        '(?:([.:#*]?)' +
        '(' + identifier + ')' +
        '(?:' +
          ':[-\\w]+|' +
          '\\[[^\\]]+(?:\\]|$)|' +
          '\\x28[^\\x29]+(?:\\x29|$)' +
        ')*)$');

      // global
      reValidator = RegExp(standardValidator, 'g');

      Patterns.id = RegExp('^#(' + identifier + ')(.*)');
      Patterns.tagName = RegExp('^(' + identifier + ')(.*)');
      Patterns.className = RegExp('^\\.(' + identifier + ')(.*)');
      Patterns.attribute = RegExp('^(?:' + attrmatcher + ')(.*)');
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

  S_HEAD = 'var e,n,o,j=r.length-1,k=-1',
  M_HEAD = 'var e,n,o',
  N_HEAD = 'var e,n,o,j=r.length-1,k=-1',

  S_LOOP = 'main:while((e=c[++k]))',
  M_LOOP = 'e=c;',
  N_LOOP = 'main:while((e=c.item(++k)))',

  S_BODY = 'r[++j]=c[k];',
  M_BODY = '',
  N_BODY = 'r[++j]=c.item(k);',

  S_TAIL = 'continue main;',
  M_TAIL = 'r=true;',
  N_TAIL = 'continue main;',

  S_TEST = 'if(f(c[k])){break main;}',
  M_TEST = 'f(c);',
  N_TEST = 'if(f(c.item(k))){break main;}',

  S_VARS = [ ],
  M_VARS = [ ],
  N_VARS = [ ],

  // Skip a CSS escape, including the optional terminator of a hex escape.
  escapeEnd =
    function(text, index) {
      var start = ++index;
      while (index < text.length && index - start < 6 && /[0-9a-f]/i.test(text[index])) { ++index; }
      if (index == start) { return Math.min(index + 1, text.length); }
      if (/[\x20\t\r\n\f]/.test(text[index] || '')) {
        if (text[index++] == '\r' && text[index] == '\n') { ++index; }
      }
      return index;
    },

  // Normalize syntax only. Quoted values and complete CSS escapes are opaque.
  normalizeSelector =
    function(text) {
      var output = '', quote = '', bracket = 0, space = false, i = 0, end, c;
      while (i < text.length) {
        c = text[i];
        if (c == '\\') {
          if (space && output && !/[>+~,(]$/.test(output)) { output += ' '; }
          space = false;
          end = escapeEnd(text, i);
          output += text.slice(i, end); i = end;
          continue;
        }
        ++i;
        if (quote) {
          output += c;
          if (c == quote) { quote = ''; }
          continue;
        }
        if (/[\x20\t\r\n\f]/.test(c)) { space = true; continue; }
        if (space && output && (bracket || !/[>+~,)]/.test(c)) &&
          !/[>+~,(]$/.test(output)) { output += ' '; }
        space = false;
        output += c;
        if (c == '"' || c == "'") { quote = c; }
        else if (c == '[') { ++bracket; }
        else if (c == ']') { --bracket; }
      }
      return output;
    },

  asciiLower =
    function(value) {
      return value.replace(/[A-Z]/g, function(c) { return c.toLowerCase(); });
    },

  tagGuard =
    function(name) {
      var exact = 'e.localName===' + JSON.stringify(name), lower = asciiLower(name);
      return HTML_DOCUMENT && lower != name ? '(' + exact +
        '||(e.namespaceURI==="http://www.w3.org/1999/xhtml"&&e.localName===' + JSON.stringify(lower) + '))' : '(' + exact + ')';
    },

  idGuard =
    function(name) {
      return QUIRKS_MODE ? 's.asciiLower(e.getAttribute("id")||"")===' + JSON.stringify(asciiLower(name)) :
        'e.getAttribute("id")===' + JSON.stringify(name);
    },

  tagMatches =
    function(element, name) {
      return element.localName === name || HTML_DOCUMENT &&
        element.namespaceURI === 'http://www.w3.org/1999/xhtml' && element.localName === asciiLower(name);
    },

  attributeValueTest =
    function(actual, operator, expected) {
      if (actual === null) { return false; }
      switch (operator) {
        case '=': return actual === expected;
        case '^=': return !!expected && actual.indexOf(expected) === 0;
        case '$=': return !!expected && actual.slice(-expected.length) === expected;
        case '*=': return !!expected && actual.indexOf(expected) !== -1;
        case '|=': return actual === expected || actual.indexOf(expected + '-') === 0;
        case '~=': return !!expected && !/[\t\n\f\r ]/.test(expected) && hasClassValue(actual, expected);
      }
      return false;
    },

  attributeGuard =
    function(value, operator, expected) {
      var literal = JSON.stringify(expected), condition;
      if ((operator == '^=' || operator == '$=' || operator == '*=' || operator == '~=') && !expected ||
        operator == '~=' && /[\t\n\f\r ]/.test(expected)) { return 'false'; }
      switch (operator) {
        case '=': return value + '===' + literal;
        case '^=': condition = value + '.indexOf(' + literal + ')===0'; break;
        case '$=': condition = value + '.slice(-' + expected.length + ')===' + literal; break;
        case '*=': condition = value + '.indexOf(' + literal + ')!==-1'; break;
        case '|=': condition = '(' + value + '===' + literal + '||' + value + '.indexOf(' + JSON.stringify(expected + '-') + ')===0)'; break;
        case '~=': condition = 's.hasClassValue(' + value + ',' + literal + ')'; break;
      }
      return '(' + value + '!==null&&' + condition + ')';
    },

  attributeMatches =
    function(element, name, operator, expected, folding) {
      var value = element.getAttribute(name);
      if (value !== null && (folding === 1 || folding === 2 && element.namespaceURI === 'http://www.w3.org/1999/xhtml')) {
        value = asciiLower(value); expected = asciiLower(expected);
      }
      return attributeValueTest(value, operator, expected);
    },

  // A small IR for pure compounds, structural predicates and logical lists.
  // Unknown constructs stay opaque and use the full compiler below. The
  // inlining budget bounds both recursive analysis and generated source size.
  readCompound =
    function(text, budget) {
      var result = { tag: null, ids: [], classes: [], attributes: [], logical: [], states: [] },
        match, symbol, name, list, branches, branch, i, flag;
      if (!text || budget.depth > 8) { return null; }
      while (text) {
        if (--budget.left < 0) { return null; }
        symbol = text[0];
        if (symbol == '*') { match = text.match(Patterns.universal); }
        else if (symbol == '#' || symbol == '.') {
          match = text.match(symbol == '#' ? Patterns.id : Patterns.className);
          if (!match) { return null; }
          result[symbol == '#' ? 'ids' : 'classes'].push(unescapeIdentifier(match[1]));
        } else if (symbol == '[') {
          match = text.match(Patterns.attribute);
          if (!match || STD.namespaces.test(match[0]) || match[2] && !ATTR_STD_OPS[match[2]]) { return null; }
          name = unescapeIdentifier(match[1]);
          flag = (match[5] || '').toLowerCase();
          result.attributes.push({ name: name, operator: match[2] || '',
            value: unescapeIdentifier(match[4] || ''),
            folding: flag == 'i' ? 1 : flag != 's' && HTML_DOCUMENT && HTML_TABLE[name.toLowerCase()] ? 2 : 0 });
        } else if (symbol == ':' && (match = text.match(Patterns.structural))) {
          result.states.push({ name: match[1].toLowerCase() });
        } else if (symbol == ':' && (match = text.match(Patterns.treestruct))) {
          result.states.push({ name: match[1].toLowerCase(), formula: match[2].replace(/\s/g, '').toLowerCase() });
        } else if (symbol == ':' && (match = matchLogical(text, /^:(is|where|matches|not)\(/i))) {
          list = splitList(match[2]); branches = [];
          ++budget.depth;
          for (i = 0; i < list.length; ++i) {
            branch = readCompound(list[i], budget);
            if (!branch) { --budget.depth; return null; }
            branches.push(branch);
          }
          --budget.depth;
          result.logical.push({ negative: match[1].toLowerCase() == 'not', branches: branches });
        } else if (/[_a-z\\-]/i.test(symbol) && result.tag === null) {
          match = text.match(Patterns.tagName);
          if (!match) { return null; }
          result.tag = unescapeIdentifier(match[1]);
        } else { return null; }
        text = match[match.length - 1];
      }
      return result;
    },

  selectorInfo =
    function(text) {
      var key = text, cached = selectorInfos.get(text);
      if (cached) { return cached; }
      var info = { compounds: [], relations: [], leading: '', pure: true,
        effects: false, extension: false, contextual: false, nthElement: false, nthType: false },
        quote = '', depth = 0, start = 0, i = 0, c, piece, compound, match,
        relation, normalized = normalizeSelector(text);
      if (/^[\x20\t]/.test(text)) { info.leading = ' '; }
      text = normalized;
      for (; i < text.length; ++i) {
        c = text[i];
        if (c == '\\') { i = escapeEnd(text, i) - 1; continue; }
        if (quote) { if (c == quote) { quote = ''; } continue; }
        if (c == '"' || c == "'") { quote = c; continue; }
        if (c == '[') {
          match = text.slice(i).match(Patterns.attribute);
          if (match && match[2] && !ATTR_STD_OPS[match[2]]) { info.extension = info.effects = true; }
        }
        if (!depth && c in Combinators) { info.extension = info.effects = true; }
        if (c == '[' || c == '(') { ++depth; }
        else if (c == ']' || c == ')') { --depth; }
        if (c == ':' && (match = /^:([-\w]+)/.exec(text.slice(i)))) {
          piece = match[1].toLowerCase();
          if (piece == 'scope' || piece == 'root') { info.contextual = true; }
          if (/^nth/.test(piece)) {
            match = text.slice(i).match(Patterns.treestruct);
            if (!match || nthNeedsCache(match[2])) {
              if (/^nth(?:-last)?-child$/.test(piece)) { info.nthElement = true; }
              if (/^nth(?:-last)?-of-type$/.test(piece)) { info.nthType = true; }
            }
          }
          if (/^(valid|invalid)$/.test(piece)) { info.effects = true; }
          if (!/^(?:is|where|matches|not|has|nth(?:-last)?-(?:child|of-type)|scope|root|empty|(?:first|last|only)-(?:child|of-type)|dir|lang|any-link|link|visited|target|defined|hover|active|focus(?:-within|-visible)?|enabled|disabled|read-only|read-write|placeholder-shown|default|autofill|-webkit-autofill|checked|indeterminate|required|optional|valid|invalid|in-range|out-of-range|playing|paused|seeking|buffering|stalled|muted|volume-locked|open|closed|modal|fullscreen|picture-in-picture|popover-open|popover)$/.test(piece)) {
            info.extension = info.effects = true;
          }
        }
        if (!depth && /[ >+~]/.test(c)) {
          piece = text.slice(start, i);
          relation = c;
          if (!piece && !info.compounds.length) { info.leading = relation; }
          else { info.compounds.push(piece); info.relations.push(relation); }
          start = i + 1;
        }
      }
      info.compounds.push(text.slice(start));
      for (i = 0; i < info.compounds.length; ++i) {
        piece = info.compounds[i];
        compound = readCompound(piece, { left: 64, depth: 0 });
        info.compounds[i] = { text: piece, simple: compound };
        if (!compound) { info.pure = false; }
      }
      // Custom operators/combinators and escaped pseudo names are opaque.
      if (!info.pure && text.indexOf('\\') > -1) {
        info.extension = info.effects = true;
      }
      info.cacheSize = text.length * 6 + info.compounds.length * 160;
      selectorInfos.set(key, info);
      return info;
    },

  stateExpression =
    function(item) {
      var name = item.name, typed, last, formula, match, a, b, position;
      switch (name) {
        case 'scope': return 'e===(s.from.nodeType===9?s.root:s.from)';
        case 'root': return 'e===s.root';
        case 'empty': return 's.isEmpty(e)';
        case 'first-child': return '!e.previousElementSibling';
        case 'last-child': return '!e.nextElementSibling';
        case 'only-child': return '(!e.previousElementSibling&&!e.nextElementSibling)';
        case 'first-of-type': return 's.nthWithin(e,false,true,1)===1';
        case 'last-of-type': return 's.nthWithin(e,true,true,1)===1';
        case 'only-of-type': return '(s.nthWithin(e,false,true,1)===1&&s.nthWithin(e,true,true,1)===1)';
      }
      formula = item.formula;
      typed = name.indexOf('of-type') > -1; last = name.indexOf('last') > -1;
      if (formula == 'n') { return 'true'; }
      if (/^[+-]?\d+$/.test(formula)) {
        b = +formula;
        if (b <= 0) { return 'false'; }
        return (b <= 8 ? 's.nthWithin(e,' + last + ',' + typed + ',' + b + ')' :
          's.nth' + (typed ? 'OfType' : 'Element') + '(e,' + last + ')') + '===' + b;
      }
      formula = formula == 'even' ? '2n' : formula == 'odd' ? '2n+1' : formula;
      match = /^([+-]?\d*)n([+-]?\d+)?$/.exec(formula);
      if (!match) { return 'false'; }
      a = match[1] == '' || match[1] == '+' ? 1 : match[1] == '-' ? -1 : +match[1];
      b = +(match[2] || 0);
      position = 's.nth' + (typed ? 'OfType' : 'Element') + '(e,' + last + ')';
      if (!a) { return b > 0 ? position + '===' + b : 'false'; }
      return 's.nthFormula(' + position + ',' + a + ',' + b + ')';
    },

  nthFormula =
    function(position, a, b) {
      return position > 0 && (a > 0 ? position >= b : position <= b) && (position - b) % a === 0;
    },

  isEmpty =
    function(element) {
      var node = element.firstChild;
      while (node && node.nodeType != 1 && node.nodeType != 3 && node.nodeType != 4) { node = node.nextSibling; }
      return !node;
    },

  compoundExpression =
    function(compound, state, inherited) {
      var tests = [], classes = [], facts = Object.create(inherited || null), attrs = Object.create(null),
        i, j, key, item, group, variable, value, expression, branches, exact, folding, checks;
      if (compound.tag !== null) { tests.push(tagGuard(compound.tag)); }
      for (i = 0; i < compound.ids.length; ++i) {
        tests.push(idGuard(compound.ids[i]));
      }
      for (i = 0; i < compound.attributes.length; ++i) {
        item = compound.attributes[i];
        if (!item.operator) {
          for (j = 0; j < compound.attributes.length; ++j) {
            if (compound.attributes[j].name == item.name && compound.attributes[j].operator) { break; }
          }
          if (j == compound.attributes.length) {
            tests.push('e.hasAttribute(' + JSON.stringify(item.name) + ')');
          }
        }
      }
      for (i = 0; i < compound.classes.length; ++i) {
        value = compound.classes[i];
        if (!value || /[\t\n\f\r ]/.test(value)) { return 'false'; }
        if (QUIRKS_MODE) { value = asciiLower(value); }
        key = '.' + value;
        if (!facts[key]) { classes.push(value); facts[key] = true; }
      }
      if (classes.length == 1 && !QUIRKS_MODE && !facts[':class']) {
        tests.push('s.hasClass(e,' + JSON.stringify(classes[0]) + ')');
      } else if (classes.length) {
        variable = facts[':class'];
        expression = '';
        if (!variable) {
          variable = 'q' + state.next++;
          state.vars.push(variable);
          expression = '(' + variable + '=' + (QUIRKS_MODE ? 's.asciiLower(s.classOf(e))' : 's.classOf(e)') + '),';
          facts[':class'] = variable;
        }
        checks = [];
        for (i = 0; i < classes.length; ++i) {
          checks.push('s.hasClassValue(' + variable + ',' + JSON.stringify(classes[i]) + ')');
        }
        // The load is deferred until preceding tag/ID guards have passed.
        tests.push('(' + expression + checks.join('&&') + ')');
      }
      for (i = 0; i < compound.attributes.length; ++i) {
        item = compound.attributes[i]; key = '$' + item.name;
        if (!item.operator) { continue; }
        if (!Object.prototype.hasOwnProperty.call(attrs, key)) { attrs[key] = []; }
        attrs[key].push(item);
      }
      for (key in attrs) {
        group = attrs[key]; variable = 'v' + state.next++; state.vars.push(variable);
        expression = '(' + variable + '=e.getAttribute(' + JSON.stringify(group[0].name) + ')),';
        checks = [];
        for (i = 0; i < group.length; ++i) {
          item = group[i];
          if (!item.operator) { checks.push(variable + '!==null'); }
          else {
            exact = null;
            for (j = 0; j < group.length; ++j) {
              if (group[j].operator == '=' && group[j].folding == item.folding && j != i) { exact = group[j]; break; }
            }
            if (exact && item.operator != '=' && (!item.folding || item.folding == 1)) {
              value = attributeValueTest(item.folding ? asciiLower(exact.value) : exact.value,
                item.operator, item.folding ? asciiLower(item.value) : item.value) ? 'true' : 'false';
            } else {
              value = attributeGuard(variable, item.operator, item.value);
              if (value == 'false') { return 'false'; }
              if (item.folding) {
                folding = attributeGuard('s.asciiLower(' + variable + ')', item.operator, asciiLower(item.value));
                value = '(' + variable + '!==null&&' + (item.folding == 1 ? folding :
                  '(e.namespaceURI==="http://www.w3.org/1999/xhtml"?' + folding + ':' + value + ')') + ')';
              }
            }
            if (value == 'false') { return 'false'; }
            if (value != 'true') { checks.push(value); }
          }
        }
        tests.push('(' + expression + (checks.join('&&') || 'true') + ')');
      }
      for (i = 0; i < compound.logical.length; ++i) {
        item = compound.logical[i]; branches = [];
        for (j = 0; j < item.branches.length; ++j) {
          branches.push(compoundExpression(item.branches[j], state, facts));
        }
        if (branches.indexOf('true') > -1) {
          if (item.negative) { return 'false'; }
          continue;
        }
        branches = branches.filter(function(branch) { return branch != 'false'; });
        if (!branches.length) {
          if (!item.negative) { return 'false'; }
          continue;
        }
        tests.push((item.negative ? '!' : '') + '(' + branches.join('||') + ')');
      }
      for (i = 0; i < compound.states.length; ++i) {
        expression = stateExpression(compound.states[i]);
        if (expression == 'false') { return 'false'; }
        if (expression != 'true') { tests.push('(' + expression + ')'); }
      }
      return tests.length ? '(' + tests.join('&&') + ')' : 'true';
    },

  compileSimple =
    function(info, source, callback, seed) {
      if (!info.pure || info.leading) { return null; }
      var parts = info.compounds, relation = info.relations[0], i, step, code,
        state = { next: 0, vars: [] }, facts = Object.create(null);
      if (seed && seed.kind == '.') {
        seed.name.split(' ').forEach(function(name) { facts['.' + (QUIRKS_MODE ? asciiLower(name) : name)] = true; });
      }
      if (parts.length > 1) {
        if (callback) { return null; }
        if (relation != ' ' && relation != '~') { return compileMixed(info, source, callback, seed); }
        for (i = 1; i < info.relations.length; ++i) {
          if (info.relations[i] != relation) { return compileMixed(info, source, callback, seed); }
        }
      }
      var condition = compoundExpression(parts[parts.length - 1].simple, state, facts);
      if (condition == 'false') { return ''; }
      code = condition == 'true' ? '' : 'if(' + condition + '){';
      if (parts.length > 1) {
        step = relation == ' ' ? 'parentElement' : 'previousElementSibling';
        code += 'chain:{';
        for (i = parts.length - 2; i >= 0; --i) {
          code += 'e=e.' + step + ';while(e&&!(' + compoundExpression(parts[i].simple, state) + ')){e=e.' + step + ';}if(!e)break chain;';
        }
        code += source + '}';
      } else { code += source; }
      return (state.vars.length ? 'var ' + state.vars.join(',') + ';' : '') + code + (condition == 'true' ? '' : '}');
    },

  // Memoize failed and successful suffix states only during this invocation.
  // Mixed descendant/child paths otherwise revisit the same ancestors through
  // different backtracking paths. Small fixed paths keep the compact compiler.
  compileMixed =
    function(info, source, callback, seed) {
      var parts = info.compounds, count = 0, i, relation, step, condition, code,
        state, prefix, declarations = '', greedy, saved;
      if (!compilation || callback || parts.length < 4) { return null; }
      for (i = 0; i < info.relations.length; ++i) {
        if (info.relations[i] == ' ' || info.relations[i] == '~') { ++count; }
      }
      if (count < 2) { return null; }
      prefix = 'p' + compilation.prelude.length + '_';
      for (i = 0; i < parts.length; ++i) {
        state = { next: 0, vars: [] };
        condition = compoundExpression(parts[i].simple, state);
        // Most hits finish before revisiting a state. Delay map allocation
        // until this invocation has performed enough work to amortize it.
        code = 'var original=e,map=m[' + (i + 1) + '],r;' +
          'if(map){r=map.get(e);if(r!==undefined)return r;}' +
          'else if(++m[0]>64){map=m[' + (i + 1) + ']=new WeakMap();}r=false;';
        if (state.vars.length) { code += 'var ' + state.vars.join(',') + ';'; }
        code += 'if(' + condition + '){';
        if (!i) { code += 'r=true;'; }
        else {
          relation = info.relations[i - 1];
          step = relation == ' ' || relation == '>' ? 'parentElement' : 'previousElementSibling';
          code += 'e=e.' + step + ';';
          code += relation == '>' || relation == '+' ?
            'r=!!e&&' + prefix + (i - 1) + '(e,m);' :
            'while(e){if(' + prefix + (i - 1) + '(e,m)){r=true;break;}e=e.' + step + ';}';
        }
        declarations += 'function ' + prefix + i + '(e,m){' + code + '}if(map)map.set(original,r);return r;}';
      }
      compilation.prelude.push(declarations);
      compilation.memo = true;
      // A successful nearest-ancestor path needs no backtracking or maps.
      // Failure only rejects this speculative path, then the full matcher
      // retries every legal alternative with query-local memoization.
      state = { next: 0, vars: [] }; saved = prefix + 'saved';
      greedy = 'var ' + saved + '=e;greedy:{if(!(' + compoundExpression(parts[parts.length - 1].simple, state) + '))break greedy;';
      for (i = parts.length - 2; i >= 0; --i) {
        relation = info.relations[i];
        step = relation == ' ' || relation == '>' ? 'parentElement' : 'previousElementSibling';
        condition = compoundExpression(parts[i].simple, state);
        greedy += 'e=e.' + step + ';';
        if (relation == ' ' || relation == '~') { greedy += 'while(e&&!(' + condition + ')){e=e.' + step + ';}'; }
        else { greedy += 'if(e&&!(' + condition + '))break greedy;'; }
        greedy += 'if(!e)break greedy;';
      }
      greedy += source + '}e=' + saved + ';';
      return (state.vars.length ? 'var ' + state.vars.join(',') + ';' : '') + greedy +
        'if(' + prefix + (parts.length - 1) + '(e,memo||(memo=[0]))){' + source + '}';
    },

  compilation = null,

  // Bind pure complex logical branches once. Opaque extensions retain their
  // lazy/forgiving contract and are never speculatively compiled here.
  logicalCall =
    function(argument, forgiving) {
      var list = splitList(argument), i, factories = [], size = 0, index,
        selectVars = S_VARS, matchVars = M_VARS, nodeVars = N_VARS;
      if (compilation && compilation.allowBindings) {
        for (i = 0; i < list.length; ++i) {
          if (!selectorInfo(list[i]).pure || selectorInfo(list[i]).leading) { break; }
        }
        if (i == list.length) {
          S_VARS = []; M_VARS = []; N_VARS = [];
          try {
            for (i = 0; i < list.length; ++i) {
              factories.push(compile(list[i], false));
              size += factories[i].cacheSize;
            }
          } finally { S_VARS = selectVars; M_VARS = matchVars; N_VARS = nodeVars; }
          index = compilation.bindings.length;
          compilation.bindings.push(function(element) { return match_assert(factories, element, null); });
          compilation.bytes += size;
          return 'b[' + index + '](e)';
        }
      }
      return 's.' + (forgiving ? 'matchForgiving' : 'match') + '(' + JSON.stringify(argument) + ',e)';
    },

  // compile groups or single selector strings into
  // executable functions for matching or selecting
  compile =
    function(selector, mode, callback, relative, seed) {
      var cacheKey = mode + ':' + (callback ? 1 : 0) + ':' +
        (relative ? 1 : 0) + ':' + JSON.stringify(seed || null) + ':' + selector;
      var factory, head = '', loop = '', macro = '', source = '', vars = '',
        enter = '', cleanup = '', info, previousCompilation, current;

      // Internal modes 1/2 find a boolean/node; 3 retains extension macros.
      // true = select / false = match
      // null to use collection.item()
      switch (mode) {
        case true:
          if ((factory = selectLambdas.get(cacheKey))) { return factory; }
          macro = S_BODY + (callback ? S_TEST : '') + S_TAIL;
          head = S_HEAD;
          loop = S_LOOP;
          break;
        case false:
          if ((factory = matchLambdas.get(cacheKey))) { return factory; }
          macro = M_BODY + (callback ? M_TEST + M_TAIL : 'r=true;break matched;');
          head = M_HEAD;
          loop = callback ? M_LOOP : 'matched:{' + M_LOOP;
          break;
        case 1:
        case 2:
          // Early-exit queries need neither a result array nor a callback.
          if ((factory = selectLambdas.get(cacheKey))) { return factory; }
          macro = (mode === 1 ? 'r=true;' : 'r=c[k];') + 'break main;';
          head = 'var e,n,o,k=-1';
          loop = S_LOOP;
          break;
        case 3:
          if ((factory = selectLambdas.get(cacheKey))) { return factory; }
          macro = S_BODY + 'if(r.length){break main;}' + S_TAIL;
          head = S_HEAD;
          loop = S_LOOP;
          break;
        case null:
          if ((factory = selectLambdas.get(cacheKey))) { return factory; }
          macro = N_BODY + (callback ? N_TEST : '') + N_TAIL;
          head = N_HEAD;
          loop = N_LOOP;
          break;
        default:
          break;
      }

      previousCompilation = compilation;
      info = selectorInfo(selector);
      current = compilation = { bindings: [], prelude: [], bytes: 0, memo: false, allowBindings: !info.extension };
      try {
        source = compileSelector(
          relative && !/^[>+~]/.test(selector) ? ' ' + selector : selector,
          relative ? 'if(e===s.anchor){' + macro + '}' : macro,
          mode === 3 ? true : mode, callback, seed);

        loop += mode || mode === null ? '{' + source + '}' : source;
        if (mode === false && !callback) { loop += '}'; }

        // Nested logical queries share nth positions for the outer query's
        // lifetime. Standalone matches and early exits still release them.
        // Constant formulas use sibling checks and need no cache management.
        if (info.effects || callback) {
          enter += '++s.nthUncachedDepth;';
          cleanup += '--s.nthUncachedDepth;s.clearNth();';
        }
        if (info.nthElement || info.extension && source.indexOf('s.nthElement(') > -1) {
          enter += '++s.nthElementDepth;';
          cleanup += 'if(!--s.nthElementDepth)s.nthElement(null,2);';
        }
        if (info.nthType || info.extension && source.indexOf('s.nthOfType(') > -1) {
          enter += '++s.nthTypeDepth;';
          cleanup += 'if(!--s.nthTypeDepth)s.nthOfType(null,2);';
        }

        if (S_VARS[0] || M_VARS[0] || N_VARS[0]) {
          vars = ',' + (S_VARS.join(',') || M_VARS.join(',') || N_VARS[0]);
          S_VARS.length = 0;
          M_VARS.length = 0;
          N_VARS.length = 0;
        }

        loop += 'return r;';
        if (cleanup) { loop = enter + 'try{' + loop + '}finally{' + cleanup + '}'; }
        source = source || '';
        var generated = current.prelude.join('') + F_INIT + '{' + head + vars + ';' +
          (current.memo ? 'var memo;' : '') + loop + '}';
        factory = Function('s', 'b', generated)(Snapshot, current.bindings);
        factory.empty = source === '';
        factory.cacheSize = generated.length * 2 + current.bytes + 128;

        if (mode || mode === null) {
          selectLambdas.set(cacheKey, factory);
        } else {
          matchLambdas.set(cacheKey, factory);
        }

        return factory;
      } finally { compilation = previousCompilation; }
    },

  // Cheap guards dominate the costly checks in the same compound selector.
  // Three cost buckets avoid a sort and merge guards into one short circuit.
  compileGuards =
    function(source, guards) {
      if (!guards[0].length && !guards[1].length && !guards[2].length) { return source; }
      var tests = guards[0].concat(guards[1], guards[2]);
      guards[0].length = guards[1].length = guards[2].length = 0;
      return tests.length ? 'if(' + tests.join('&&') + '){' + source + '}' : source;
    },

  // build conditional code to check components of selector strings
  compileSelector =
    function(expression, source, mode, callback, seed) {

      var a, b, n, f, k = 0, compat, name,
      NS, expr, match, result, status, symbol,
      test, type, selector = expression, vars, guards = [[], [], []],
      simple = compileSimple(selectorInfo(expression), source, callback, seed);

      if (simple !== null) { return simple; }

      // isolate selector combinators
      selector = (/^[\x20\t]/.test(selector) ? ' ' : '') + normalizeSelector(selector);

      // javascript needs a label to break
      // out of the while loops processing
      selector_recursion_label:

      while (selector) {

        ++k;

        // get namespace prefix if present or get first char of selector
        symbol = STD.apimethods.test(selector) ? '|' : selector[0];

        // A combinator changes e. Never move a guard across that change or
        // across an extension whose code may observe or replace the node.
        if (' >+~\x09'.indexOf(symbol) > -1 || symbol in Combinators) {
          source = compileGuards(source, guards);
        }

        switch (symbol) {

          // universal resolver
          case '*':
            match = selector.match(Patterns.universal);
            break;

          // id resolver
          case '#':
            match = selector.match(Patterns.id);
            guards[1].push('(' + idGuard(unescapeIdentifier(match[1])) + ')');
            break;

          // class name resolver
          case '.':
            match = selector.match(Patterns.className);
            if (QUIRKS_MODE) {
              compat = 'i.test(e.getAttribute("class"))';
              guards[2].push('(/(^|\\s)' + escapeIdentifier(match[1]).replace(REX.RegExpChar, '\\$&') + '(\\s|$)/' + compat + ')');
            } else {
              guards[2].push('s.hasClass(e,' + JSON.stringify(unescapeIdentifier(match[1])) + ')');
            }
            break;

          // tag name resolver
          case (/[_a-z]/i.test(symbol) ? symbol : undefined):
            match = selector.match(Patterns.tagName);
            guards[0].push(tagGuard(unescapeIdentifier(match[1])));
            break;

          // namespace resolver
          case '|':
            match = selector.match(Patterns.namespace);
            if (match[1] == '*') {
              // The wildcard adds no runtime condition.
            } else if (!match[1]) {
              guards[0].push('(!e.namespaceURI)');
            } else if (typeof match[1] == 'string' && root.prefix == match[1]) {
              guards[0].push('(e.namespaceURI=="' + NAMESPACE + '")');
            } else {
              emit('\'' + expression + '\'' + qsInvalid);
            }
            break;

          // attributes resolver
          case '[':
            match = selector.match(Patterns.attribute);
            if (!match) { break; }
            NS = match[0].match(STD.namespaces);
            name = match[1];
            expr = name.split(':');
            expr = expr.length == 2 ? expr[1] : expr[0];
            if (match[2] && !(test = Operators[match[2]])) {
              emit('\'' + expression + '\'' + qsInvalid);
              return '';
            }
            if (match[2] && ATTR_STD_OPS[match[2]] && !NS) {
              type = (match[5] || '').toLowerCase();
              type = type == 'i' ? 1 : type != 's' && HTML_DOCUMENT && HTML_TABLE[expr.toLowerCase()] ? 2 : 0;
              guards[2].push('s.attributeMatches(e,' + JSON.stringify(unescapeIdentifier(name)) + ',' +
                JSON.stringify(match[2]) + ',' + JSON.stringify(unescapeIdentifier(match[4] || '')) + ',' + type + ')');
              break;
            }
            if (match[4] === '') {
              test = match[2] == '~=' ?
                { p1: '^\\s', p2: '+$', p3: 'true' } :
                  match[2] in ATTR_STD_OPS && match[2] != '~=' ?
                { p1: '^',    p2: '$',  p3: 'true' } : test;
            } else if (match[2] == '~=' && match[4].includes(' ')) {
              // whitespace separated list but value contains space
              break;
            } else if (match[4]) {
              match[4] = escapeIdentifier(match[4]).replace(REX.RegExpChar, '\\$&');
            }
            type = match[5] == 'i' || (HTML_DOCUMENT && HTML_TABLE[expr.toLowerCase()]) ? 'i' : '';
            test = '(' +
              (!match[2] ? (NS ? 's.hasAttributeNS(e,"' + name + '")' : 'e.hasAttribute&&e.hasAttribute("' + name + '")') :
              !match[4] && ATTR_STD_OPS[match[2]] && match[2] != '~=' ? 'e.getAttribute&&e.getAttribute("' + name + '")==""' :
              '(/' + test.p1 + match[4] + test.p2 + '/' + type + ').test(e.getAttribute&&e.getAttribute("' + name + '"))==' + test.p3) +
              ')';
            if (!match[2] || ATTR_STD_OPS[match[2]]) {
              guards[match[2] ? 2 : 1].push(test);
            } else {
              source = compileGuards(source, guards);
              source = 'if(' + test + '){' + source + '}';
            }
            break;

          // *** General sibling combinator
          // E ~ F (F relative sibling of E)
          case '~':
            match = selector.match(Patterns.relative);
            source = 'var N' + k + '=e;while(e&&(e=e.previousElementSibling)){' + source + '}e=N' + k + ';';
            break;

          // *** Adjacent sibling combinator
          // E + F (F adiacent sibling of E)
          case '+':
            match = selector.match(Patterns.adjacent);
            source = 'var N' + k + '=e;if(e&&(e=e.previousElementSibling)){' + source + '}e=N' + k + ';';
            break;

          // *** Descendant combinator
          // E F (E ancestor of F)
          case '\x09':
          case '\x20':
            match = selector.match(Patterns.ancestor);
            source = 'var N' + k + '=e;while(e&&(e=e.parentElement)){' + source + '}e=N' + k + ';';
            break;

          // *** Child combinator
          // E > F (F children of E)
          case '>':
            match = selector.match(Patterns.children);
            source = 'var N' + k + '=e;if(e&&(e=e.parentElement)){' + source + '}e=N' + k + ';';
            break;

          // *** user supplied combinators extensions
          case (symbol in Combinators ? symbol : undefined):
            // for other registered combinators extensions
            match[match.length - 1] = '*';
            source = Combinators[symbol](match) + source;
            break;

          // *** tree-structural pseudo-classes
          // :root, :empty, :first-child, :last-child, :only-child, :first-of-type, :last-of-type, :only-of-type
          case ':':
            if ((match = selector.match(Patterns.structural))) {
              match[1] = match[1].toLowerCase();
              switch (match[1]) {
                case 'scope':
                  // use the root (documentElement) when comparing against a document
                  source = 'if(e===(s.from.nodeType===9?s.root:s.from)){' + source + '}';
                  break;
                case 'root':
                  // there can only be one :root element, so exit the loop once found
                  source = 'if((e===s.root)){' + source + (mode ? 'break main;' : '') + '}';
                  break;
                case 'empty':
                  // matches elements that don't contain elements or text nodes
                  source = 'n=e.firstChild;while(n&&n.nodeType!=1&&n.nodeType!=3&&n.nodeType!=4){n=n.nextSibling}if(!n){' + source + '}';
                  break;

                // *** child-indexed pseudo-classes
                // :first-child, :last-child, :only-child
                case 'only-child':
                  source = 'if((!e.nextElementSibling&&!e.previousElementSibling)){' + source + '}';
                  break;
                case 'last-child':
                  source = 'if((!e.nextElementSibling)){' + source + '}';
                  break;
                case 'first-child':
                  source = 'if((!e.previousElementSibling)){' + source + '}';
                  break;

                // *** typed child-indexed pseudo-classes
                // :only-of-type, :last-of-type, :first-of-type
                case 'only-of-type':
                case 'last-of-type':
                case 'first-of-type':
                  source = 'if(' + stateExpression({ name: match[1] }) + '){' + source + '}';
                  break;
                default:
                  emit('\'' + expression + '\'' + qsInvalid);
                  break;
              }
            }

            // *** child-indexed & typed child-indexed pseudo-classes
            // :nth-child, :nth-of-type, :nth-last-child, :nth-last-of-type
            else if ((match = selector.match(Patterns.treestruct))) {
              match[1] = match[1].toLowerCase();
              switch (match[1]) {
                case 'nth-child':
                case 'nth-of-type':
                case 'nth-last-child':
                case 'nth-last-of-type':
                  expr = /-of-type/i.test(match[1]);
                  if (match[1] && match[2]) {
                    type = /last/i.test(match[1]);
                    match[2] = match[2].replace(/\s/g, '').toLowerCase();
                    if (match[2] == 'n') {
                      // Every element satisfies this formula.
                      break;
                    } else if (/^[+-]?\d+$/.test(match[2]) && +match[2] <= 0) {
                      source = '';
                      break;
                    } else if (match[2] == '1') {
                      test = type ? 'next' : 'previous';
                      source = expr ? 'n=e;o=e.localName;' +
                        'while((n=n.' + test + 'ElementSibling)&&(n.localName!=o||n.namespaceURI!==e.namespaceURI));if(!n){' + source + '}' :
                        'if(!e.' + test + 'ElementSibling){' + source + '}';
                      break;
                    } else if (/^[+-]?\d+$/.test(match[2]) && +match[2] <= 8) {
                      source = 'if(s.nthWithin(e,' + type + ',' + expr + ',' + (+match[2]) + ')===' + (+match[2]) + '){' + source + '}';
                      break;
                    } else if (match[2] == 'even' || match[2] == '2n0' || match[2] == '2n+0' || match[2] == '2n') {
                      test = 'n%2==0';
                    } else if (match[2] == 'odd'  || match[2] == '2n1' || match[2] == '2n+1') {
                      test = 'n%2==1';
                    } else {
                      f = /n/i.test(match[2]);
                      n = match[2].split('n');
                      a = parseInt(n[0], 10) || 0;
                      b = parseInt(n[1], 10) || 0;
                      if (n[0] == '-') { a = -1; }
                      if (n[0] == '+') { a = +1; }
                      test = (b ? '(n' + (b > 0 ? '-' : '+') + Math.abs(b) + ')' : 'n') + '%' + a + '==0' ;
                      test =
                        a >= +1 ? (f ? 'n>' + (b - 1) + (Math.abs(a) != 1 ? '&&' + test : '') : 'n==' + a) :
                        a <= -1 ? (f ? 'n<' + (b + 1) + (Math.abs(a) != 1 ? '&&' + test : '') : 'n==' + a) :
                        a === 0 ? (n[0] ? 'n==' + b : 'n>' + (b - 1)) : 'false';
                    }
                    expr = expr ? 'OfType' : 'Element';
                    type = type ? 'true' : 'false';
                    source = 'n=s.nth' + expr + '(e,' + type + ');if((' + test + ')){' + source + '}';
                  } else {
                    emit('\'' + expression + '\'' + qsInvalid);
                  }
                  break;
                default:
                  emit('\'' + expression + '\'' + qsInvalid);
                  break;
              }
            }

            // *** logical combination pseudo-classes
            // :is( s1, [ s2, ... ]), :not( s1, [ s2, ... ]),
            // :has( s1, [ s2, ... ]) no nesting is allowed for
            // :where( s1, [ s2, ... ]), :matches( s1, [ s2, ... ]),
            else if ((match = matchLogical(selector))) {
              match[1] = match[1].toLowerCase();
              switch (match[1]) {
                case 'is':
                case 'where':
                  if (match[2] == '*') { break; }
                  if (Config.FORGIVING) {
                    source = 'if(' + logicalCall(match[2], true) + '){' + source + '}';
                  } else {
                    if (!validateLogical(match[2], false)) {
                      return '';
                    }
                    source = 'if(' + logicalCall(match[2], false) + '){' + source + '}';
                  }
                  break;
                case 'matches':
                  if (!validateLogical(match[2], false)) {
                    return '';
                  }
                  source = 'if(' + logicalCall(match[2], false) + '){' + source + '}';
                  break;
                case 'not':
                  if (!validateLogical(match[2], false)) {
                    return '';
                  }
                  source = 'if(!' + logicalCall(match[2], false) + '){' + source + '}';
                  break;
                case 'has':
                  match[2] = prepareHas(match[2]);
                  if (match[2] === null) {
                    emit('\'' + expression + '\'' + qsInvalid);
                    return '';
                  }
                  if (!validateLogical(match[2], true)) {
                    return '';
                  }
                  if (/^(?:>\s*)?\*$/.test(match[2])) {
                    source = 'if(e.firstElementChild){' + source + '}';
                  } else if (/^[+~]\s*\*$/.test(match[2])) {
                    source = 'if(e.nextElementSibling){' + source + '}';
                  } else {
                    source = 'if(s.has(' + JSON.stringify(match[2]) + ',e)){' + source + '}';
                  }
                  break;
                default:
                  emit('\'' + expression + '\'' + qsInvalid);
                  break;
              }
            }

            // *** linguistic pseudo-classes
            // :dir( ltr / rtl ), :lang( en )
            else if ((match = selector.match(Patterns.linguistic))) {
              match[1] = match[1].toLowerCase();
              switch (match[1]) {
                case 'dir':
                  source = 'var p;if((' +
                    '(/' + match[2] + '/i.test(e.dir))||(p=s.ancestor("[dir]", e))&&' +
                    '(/' + match[2] + '/i.test(p.dir))||(e.dir==""||e.dir=="auto")&&' +
                    '(' + (match[2] == 'ltr' ? '!':'')+ RTL +'.test(e.textContent)))' +
                    '){' + source + '};';
                  break;
                case 'lang':
                  expr = '(?:^|-)' + match[2] + '(?:-|$)';
                  source = 'var p;if((' +
                    '(e.isConnected&&(e.lang==""&&(p=s.ancestor("[lang]",e)))&&' +
                    '(p.lang=="' + match[2] + '")||/'+ expr +'/i.test(e.lang)))' +
                    '){' + source + '};';
                  break;
                default:
                  emit('\'' + expression + '\'' + qsInvalid);
                  break;
              }
            }

            // *** location pseudo-classes
            // :any-link, :link, :visited, :target, :defined
            else if ((match = selector.match(Patterns.locationpc))) {
              match[1] = match[1].toLowerCase();
              switch (match[1]) {
                case 'any-link':
                  source = 'if((s.isLink(e)||e.visited)){' + source + '}';
                  break;
                case 'link':
                  source = 'if(s.isLink(e)){' + source + '}';
                  break;
                case 'visited':
                  source = 'if((s.isLink(e)&&e.visited)){' + source + '}';
                  break;
                case 'target':
                  source = 'if((s.doc.location.hash&&e.id==s.doc.location.hash.slice(1)&&(s.doc.compareDocumentPosition(e)&16))){' + source + '}';
                  break;
                case 'defined':
                  source = 'if(s.isDefined(e)){' + source + '}';
                  break;
                default:
                  emit('\'' + expression + '\'' + qsInvalid);
                  break;
              }
            }

            // *** user actions pseudo-classes
            // :hover, :active, :focus, :focus-visible, :focus-within
            else if ((match = selector.match(Patterns.useraction))) {
              match[1] = match[1].toLowerCase();
              switch (match[1]) {
                case 'hover':
                  source = 'if(e===s.HOVER){' + source + '}';
                  break;
                case 'active':
                  source = 'if(e===s.doc.activeElement){' + source + '}';
                  break;
                case 'focus':
                  source = 'if(s.isFocusable(e)){' + source + '}';
                  break;
                case 'focus-visible':
                  // The v2.x branch has no reliable keyboard-modality state.
                  // An element with observable input focus is the conservative
                  // behavior shared by focus and focus-visible in this line.
                  source = 'if(s.isFocusable(e)){' + source + '}';
                  break;
                case 'focus-within':
                  source = 'if(e.contains(s.doc.activeElement)){' + source + '}';
                  break;
                default:
                  emit('\'' + expression + '\'' + qsInvalid);
                  break;
              }
            }

            // *** user interface and form pseudo-classes
            // :enabled, :disabled, :read-only, :read-write, :placeholder-shown, :default
            else if ((match = selector.match(Patterns.inputstate))) {
              match[1] = match[1].toLowerCase();
              switch (match[1]) {
                case 'enabled':
                  // the complement of ':disabled' over the same elements
                  source = 'if((("form" in e||/^optgroup$/i.test(e.localName))&&' +
                    '"disabled" in e&&!s.isDisabled(e))){' + source + '}';
                  break;
                case 'disabled':
                  source = 'if((("form" in e||/^optgroup$/i.test(e.localName))&&' +
                    '"disabled" in e&&s.isDisabled(e))){' + source + '}';
                  break;
                case 'read-only':
                case '-moz-read-only':
                  source =
                    'if(' +
                      '(/^textarea$/i.test(e.localName)&&(e.readOnly||s.isDisabled(e)))||' +
                      '(/^input$/i.test(e.localName)&&("|date|datetime-local|email|month|number|password|search|tel|text|time|url|week|".includes("|"+e.type+"|")?(e.readOnly||s.isDisabled(e)):true))||' +
                      '(!/^(?:input|textarea)$/i.test(e.localName) && !s.isContentEditable(e))' +
                    '){' + source + '}';
                  break;
                case 'read-write':
                case '-moz-read-write':
                  source =
                    'if(' +
                      '(/^textarea$/i.test(e.localName)&&!e.readOnly&&!s.isDisabled(e))||' +
                      '(/^input$/i.test(e.localName)&&"|date|datetime-local|email|month|number|password|search|tel|text|time|url|week|".includes("|"+e.type+"|")&&!e.readOnly&&!s.isDisabled(e))||' +
                      '(!/^(?:input|textarea)$/i.test(e.localName) && s.isContentEditable(e))' +
                    '){' + source + '}';
                  break;
                case 'autofill':
                case '-webkit-autofill':
                  source = 'if(s.matchesNative(e,":autofill")||s.matchesNative(e,":-webkit-autofill")){' + source + '}';
                  break;
                case 'placeholder-shown':
                  source =
                    'if((' +
                      '(/^(?:input|textarea)$/i.test(e.localName))&&e.hasAttribute("placeholder")&&' +
                      '("|textarea|password|number|search|email|text|tel|url|".includes("|"+e.type+"|"))&&' +
                      '(!s.match(":focus",e))' +
                    ')){' + source + '}';
                  break;
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
                    ')){' + source + '}';
                  break;
                default:
                  emit('\'' + expression + '\'' + qsInvalid);
                  break;
              }
            }

            // *** input pseudo-classes (for form validation)
            // :checked, :indeterminate, :valid, :invalid, :in-range, :out-of-range, :required, :optional
            else if ((match = selector.match(Patterns.inputvalue))) {
              match[1] = match[1].toLowerCase();
              switch (match[1]) {
                case 'checked':
                  source = 'if((/^input$/i.test(e.localName)&&' +
                    '("|radio|checkbox|".includes("|"+e.type+"|")&&e.checked)||' +
                    '(/^option$/i.test(e.localName)&&(e.selected||e.checked))' +
                    ')){' + source + '}';
                  break;
                case 'indeterminate':
                  source =
                    'if((/^progress$/i.test(e.localName)&&!e.hasAttribute("value"))||' +
                      '(/^input$/i.test(e.localName)&&("checkbox"==e.type&&e.indeterminate)||' +
                      '("radio"==e.type&&e.name&&!s.first("input[name="+e.name+"]:checked",e.form))' +
                    ')){' + source + '}';
                  break;
                case 'required':
                  source =
                    'if((s.isRequired(e))' +
                    '){' + source + '}';
                  break;
                case 'optional':
                  source =
                    'if((/^(?:button|input|select|textarea)$/i.test(e.localName)&&!s.isRequired(e))' +
                    '){' + source + '}';
                  break;
                case 'invalid':
                  source =
                    'if(((' +
                      '(/^form$/i.test(e.localName)&&!e.noValidate)||' +
                      '(e.willValidate&&!e.formNoValidate))&&!s.checkValidity(e))||' +
                      '(/^fieldset$/i.test(e.localName)&&s.first(":invalid",e))' +
                    '){' + source + '}';
                  break;
                case 'valid':
                  source =
                    'if(((' +
                      '(/^form$/i.test(e.localName)&&!e.noValidate)||' +
                      '(e.willValidate&&!e.formNoValidate))&&s.checkValidity(e))||' +
                      '(/^fieldset$/i.test(e.localName)&&!s.first(":invalid",e))' +
                    '){' + source + '}';
                  break;
                case 'in-range':
                  source =
                    'if((/^input$/i.test(e.localName))&&' +
                      '(e.willValidate&&!e.formNoValidate)&&' +
                      '(!e.validity.rangeUnderflow&&!e.validity.rangeOverflow)&&' +
                      '("|date|datetime-local|month|number|range|time|week|".includes("|"+e.type+"|"))&&' +
                      '("range"==e.type||e.getAttribute("min")||e.getAttribute("max"))' +
                    '){' + source + '}';
                  break;
                case 'out-of-range':
                  source =
                    'if((/^input$/i.test(e.localName))&&' +
                      '(e.willValidate&&!e.formNoValidate)&&' +
                      '(e.validity.rangeUnderflow||e.validity.rangeOverflow)&&' +
                      '("|date|datetime-local|month|number|range|time|week|".includes("|"+e.type+"|"))&&' +
                      '("range"==e.type||e.getAttribute("min")||e.getAttribute("max"))' +
                    '){' + source + '}';
                  break;
                default:
                  emit('\'' + expression + '\'' + qsInvalid);
                  break;
              }
            }

            // resources state pseudo-classes (multimedia state)
            // :playing, :paused, :seeking, :buffering, :stalled, :muted, :volume-locked
            else if ((match = selector.match(Patterns.rsrc_state))) {
              match[1] = match[1].toLowerCase();
              switch (match[1]) {
                case 'playing':
                  source = 'if(s.isPlaying(e)){' + source + '}';
                  break;
                case 'paused':
                  source = 'if(!s.isPlaying(e)){' + source + '}';
                  break;
                case 'seeking':
                  source = 'if(!s.isPlaying(e)){' + source + '}';
                  break;
                case 'buffering':
                  break;
                case 'stalled':
                  break;
                case 'muted':
                  source = 'if(e.localName=="audio"&&e.getAttribute("muted")){' + source + '}';
                  break;
                case 'volume-locked':
                  break;
                default:
                  break;
              }
            }

            // display state pseudo-classes. Helpers use native matching when
            // available and otherwise only properties observable from the DOM.
            else if ((match = selector.match(Patterns.disp_state))) {
              match[1] = match[1].toLowerCase();
              switch (match[1]) {
                case 'open':
                  source = 'if(s.isOpen(e)){' + source + '}';
                  break;
                case 'closed':
                  source = 'if(s.isClosed(e)){' + source + '}';
                  break;
                case 'modal':
                  source = 'if(s.isModal(e)){' + source + '}';
                  break;
                case 'fullscreen':
                  source = 'if(s.isFullscreen(e)){' + source + '}';
                  break;
                case 'picture-in-picture':
                  source = 'if(s.isPictureInPicture(e)){' + source + '}';
                  break;
                case 'popover':
                case 'popover-open':
                  source = 'if(s.isPopoverOpen(e)){' + source + '}';
                  break;
                default:
                  emit('\'' + expression + '\'' + qsInvalid);
                  break;
              }
            }

            // allow pseudo-elements starting with single colon (:)
            // :after, :before, :first-letter, :first-line
            // assert: e.type is in double-colon format, like ::after
            else if ((match = selector.match(Patterns.pseudo_sng))) {
              source = compileGuards(source, guards);
              source = 'if(e.element&&e.type.toLowerCase()=="' +
                ':' + match[0].toLowerCase() + '"){e=e.element;' + source + '}';
            }

            // allow pseudo-elements starting with double colon (::)
            // ::after, ::before, ::marker, ::placeholder, ::selection,
            // ::inactive-selection, ::-webkit-<foo-bar>
            // assert: e.type is in double-colon format, like ::after
            else if ((match = selector.match(Patterns.pseudo_dbl))) {
              source = compileGuards(source, guards);
              source = 'if(e.element&&e.type.toLowerCase()=="' +
                match[0].toLowerCase() + '"){e=e.element;' + source + '}';
            }

            else {

              source = compileGuards(source, guards);

              // reset
              expr = false;
              status = false;

              // process registered selector extensions
              for (expr in Selectors) {
                if ((match = selector.match(Selectors[expr].Expression))) {
                  result = Selectors[expr].Callback(match, source, mode, callback);
                  if ('match' in result) { match = result.match; }
                  vars = result.modvar;
                  if (mode) {
                     // add extra select() vars
                     vars && S_VARS.indexOf(vars) < 0 && (S_VARS[S_VARS.length] = vars);
                  } else {
                     // add extra match() vars
                     vars && M_VARS.indexOf(vars) < 0 && (M_VARS[M_VARS.length] = vars);
                  }
                  // extension source code
                  source = result.source;
                  // extension status code
                  status = result.status;
                  // break on status error
                  if (status) { break; }
                }
              }

              if (!status) {
                if (Config.FORGIVING &&
                  selector.match(/(:(?:is|where)\x28)/)) {
                  return '';
                }
                emit('unknown pseudo-class selector \'' + selector + '\'');
                return '';
              }

              if (!expr) {
                if (Config.FORGIVING &&
                  selector.match(/(:(?:is|where)\x28)/)) {
                  return '';
                }
                emit('unknown token in selector \'' + selector + '\'');
                return '';
              }

            }
            break;

        default:
          emit('\'' + expression + '\'' + qsInvalid);
          break selector_recursion_label;

        }
        // end of switch symbol

        if (!match) {
          if (Config.FORGIVING &&
            selector.match(/(:(?:is|where)\x28)/)) {
            return '';
          }
          emit('\'' + expression + '\'' + qsInvalid);
          return '';
        }

        // pop last component
        selector = match.pop();
      }
      // end of while selector

      return compileGuards(source, guards);
    },

  // replace :scope context element as a
  // a reference in the selector string
  makeref =
    function(selectors, element) {
      // replace DOCUMENT with first element (root)
      if (element.nodeType === 9) {
        element = element.documentElement;
      }
      return selectors.replace(/:scope/i,
        (element.localName) +
        (element.id ? '#' + escapeIdentifier(element.id) : '') +
        (element.className ? '.' + escapeIdentifier(element.classList[0]) : ''));
    },

  // equivalent of w3c 'closest' method
  ancestor =
    function _closest(selectors, element, callback) {
      parse(selectors, true);
      selectors = makeref(selectors, element);
      while (element) {
        if (match(selectors, element, callback)) break;
        element = element.parentElement;
      }
      return element;
    },

  match_assert =
    function(f, element, callback) {
      for (var i = 0, l = f.length, r = false; l > i; ++i) {
        if (f[i](element, callback, null, false)) {
          // A callback observes every matching selector-list branch. Without
          // one, the first match settles the result and ends the scan.
          if (!callback) { return true; }
          r = true;
        }
      }
      return r;
    },

  match_collect =
    function(selectors, callback) {
      var i, l = selectors.length, f = [], size = 64, info, independent = true;
      for (i = 0; l > i; ++i) {
        f[i] = compile(selectors[i], false, callback);
        size += f[i].cacheSize;
        info = selectorInfo(selectors[i]);
        independent = independent && info.pure && !info.contextual;
      }
      return { factory: f, callback: !!callback, cacheSize: size, independent: independent };
    },

  // Consume string continuations before whitespace normalization. Preserve
  // escape boundaries: removing a continuation must not extend a hex escape.
  stringContinuations =
    function(selectors) {
      if (!/[\r\n\f]/.test(selectors)) { return selectors; }
      var i = 0, j, c, next, quote = '', result = '', length = selectors.length;
      while (i < length) {
        c = selectors[i++];
        if (c == '\\' && i == length && quote) { break; }
        if (c == '\\' && i < length) {
          next = selectors[i];
          if (quote && /[\r\n\f]/.test(next)) {
            ++i;
            if (next == '\r' && selectors[i] == '\n') { ++i; }
            continue;
          }
          if (quote && /[0-9a-f]/i.test(next)) {
            j = i;
            while (i < length && i - j < 6 && /[0-9a-f]/i.test(selectors[i])) { ++i; }
            result += '\\' + ('000000' + selectors.slice(j, i)).slice(-6);
            if (/[\x20\t\r\n\f]/.test(selectors[i] || '')) {
              next = selectors[i++];
              if (next == '\r' && selectors[i] == '\n') { ++i; }
            }
            continue;
          }
          result += c + selectors[i++];
          continue;
        }
        if (c == quote) { quote = ''; }
        else if (!quote && (c == '"' || c == "'")) { quote = c; }
        result += c;
      }
      // EOF closes a string. Keep its trailing whitespace inside that string
      // so selector trimming cannot erase a bad newline or a literal space.
      return result + quote;
    },

  // Reject malformed blocks before the regular-expression validator runs.
  validBlocks =
    function(text) {
      var stack = [], quote = '', chr, i = 0, length = text.length;
      for (; i < length; ++i) {
        chr = text.charAt(i);
        if (chr == '\\') {
          ++i;
          continue;
        }
        if (quote) {
          if (chr == quote) {
            quote = '';
          } else if (/[\r\n\f]/.test(chr)) {
            return false;
          }
        } else if (chr == '"' || chr == "'") {
          quote = chr;
        } else if (!validBlockToken(chr, stack)) {
          return false;
        }
      }
      // CSS closes unfinished strings and blocks at EOF.
      return true;
    },

  validBlockToken =
    function(chr, stack) {
      if (chr == '(' || chr == '[') {
        stack.push(chr);
      } else if (chr == ')' || chr == ']') {
        return stack.pop() == (chr == ')' ? '(' : '[');
      }
      return chr != '{' && chr != '}';
    },

  // unique parser entry point for all
  // methods (type matching/selecting)
  parse =
    function(selectors, type) {

      var parsed, key, cached, previousErrors = errors;

      // arguments validation
      if (arguments.length === 0) {
        emit(qsNotArgs, TypeError);
        return Config.VERBOSITY ? undefined : (type ? none : false);
      } else if (arguments[0] === '') {
        emit('\'\'' + qsInvalid);
        return Config.VERBOSITY ? undefined : (type ? none : false);
      } else if (/^[.#]?\d/.test(selectors)) {
        emit('\'\'' + qsInvalid);
        return Config.VERBOSITY ? undefined : (type ? none : false);
      }

      // input NULL or UNDEFINED
      if (typeof selectors != 'string') {
        selectors = '' + selectors;
      }
      key = selectors;
      cached = parsedSelectors.get(key);
      if (cached) { return cached; }

      selectors = stringContinuations(selectors);
      if (!validBlocks(selectors)) {
        emit("'" + selectors + "'" + qsInvalid);
        return type ? none : false;
      }

      // normalize input string
      parsed = normalizeSelector(selectors.replace(/\x00|\\$/g, '\ufffd'));

      // parse, validate and split possible compound selectors
      if ((selectors = parsed.match(reValidator)) && selectors.join('') == parsed) {
        selectors = splitList(parsed);
        if (parsed[parsed.length - 1] == ',') {
          emit(qsInvalid);
          return Config.VERBOSITY ? undefined : (type ? none : false);
        }
      } else {
        if (Config.FORGIVING) {
          // forgiving pseudos allow to continue even after parse errors
          if (!(parsed.includes(':is(') || parsed.includes(':where('))) {
            // 'selectors' holds the fragments the validator did match,
            // which read as a mangled selector once joined by String()
            emit('\'' + parsed + '\'' + qsInvalid);
            return Config.VERBOSITY ? undefined : (type ? none : false);
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
          selectors = splitList(parsed);
        }
      }

      if (selectors && errors == previousErrors) { parsedSelectors.set(key, selectors, parsed.length * 4 + 64); }
      return selectors;
    },

  // equivalent of w3c 'matches' method
  match =
    function _matches(selectors, element, callback) {
      var context = element && (element.element || element) || doc,
        previous = Snapshot.from, resolver = (context.ownerDocument || context) === doc && matchResolvers.get(selectors);
      // Pure cached predicates do not observe query scope or document roots.
      // Same-document guards already capture its immutable parsing mode, so
      // they need no context push/pop. Root/scope and extensions use the frame.
      if (resolver && !callback && !resolver.callback && resolver.independent) {
        return match_assert(resolver.factory, element, null);
      }
      if (root !== doc.documentElement) { resolver = null; }
      enterContext(context);
      try {
        return resolver && resolver.callback === !!callback ? match_assert(resolver.factory, element, callback) :
          matchInner(selectors, element, callback);
      }
      finally { leaveContext(previous); }
    },

  // Logical branches inherit the enclosing query's :scope and document.
  matchInner =
    function(selectors, element, callback) {

      var resolver;

      if (element && (resolver = matchResolvers.get(selectors)) &&
        resolver.callback === !!callback) {
        return match_assert(resolver.factory, element, callback);
      }

      resolver = match_collect(parse(selectors, false), callback);
      matchResolvers.set(selectors, resolver);

      return match_assert(resolver.factory, element, callback);
    },

  // Invalid items do not discard the remaining forgiving selectors.
  matchForgiving =
    function(list, element) {
      var argument = typeof list == 'string' ? list : list.join(','),
        plan = forgivingResolvers.get(argument), factories, i, j, l, resolver,
        previousErrors;
      if (!plan) {
        plan = { list: splitList(argument), factory: [], cacheSize: argument.length * 4 + 128 };
        forgivingResolvers.set(argument, plan);
      }
      for (i = 0, l = plan.list.length; l > i; ++i) {
        factories = plan.factory[i];
        if (!factories) {
          // Forgiving lists do not require validation of unreachable
          // branches. Compile each one only when matching reaches it.
          factories = [];
          previousErrors = errors;
          try {
            resolver = match_collect(parse(plan.list[i], false), null);
            // Quiet parse/compile errors also discard the entire branch.
            if (errors == previousErrors) { factories = resolver.factory; }
          } catch (e) { }
          plan.factory[i] = factories;
          for (j = 0; j < factories.length; ++j) { plan.cacheSize += factories[j].cacheSize; }
          forgivingResolvers.set(argument, plan);
        }
        for (j = 0; j < factories.length; ++j) {
          try {
            if (factories[j](element, null, null, false)) { return true; }
          } catch (e) { }
        }
      }
      return false;
    },

  // true if element matches the selector
  has =
    function(list, anchor) {
      var argument = typeof list == 'string' ? list : list.join(','),
        plans = hasResolvers.get(argument), context, candidates, plan,
        i = 0, length, previousErrors = errors,
        previous = Snapshot.anchor;
      if (!plans) {
        // Prepare every branch before any runtime bailout. Invalid later
        // branches must still throw when an earlier branch would match.
        list = splitList(argument);
        plans = [];
        for (length = list.length; i < length; ++i) {
          if (!list[i]) {
            emit(qsInvalid);
            return false;
          }
          plans[i] = hasPlan(list[i]);
          if (!plans[i]) { return false; }
        }
        if (errors != previousErrors) { return false; }
        plans.cacheSize = 64;
        for (i = 0; i < plans.length; ++i) { plans.cacheSize += plans[i].cacheSize; }
        hasResolvers.set(argument, plans);
      }
      Snapshot.anchor = anchor;
      try {
        for (i = 0, length = plans.length; i < length; ++i) {
          plan = plans[i];
          if (plan.bounded) {
            if (plan.factory(anchor)) { return true; }
            continue;
          }
          if (plan.sibling) {
            if (!anchor.nextElementSibling) { continue; }
            context = anchor.parentNode;
            if (!context) { continue; }
          } else {
            if (!anchor.firstElementChild) { continue; }
            context = anchor;
          }
          // Consume native collections directly when matching cannot run
          // extension code or dispatch form validation events.
          candidates = planCandidates(plan, context);
          if (plan.factory(candidates, null, context, false)) { return true; }
        }
        return false;
      } finally {
        Snapshot.anchor = previous;
      }
    },

  hasPlan =
    function(selector) {
      var parsed = parse('* ' + selector, true);
      if (!parsed || !parsed.length) { return null; }
      selector = parsed[0].slice(1).replace(/^\s+/, '');
      var info = selectorInfo(selector), bounded = compileRelative(info);
      if (bounded) { return { bounded: true, factory: bounded, cacheSize: bounded.cacheSize || 128 }; }
      return compilePlan(selector, 1, true);
    },

  // Fixed child/sibling paths walk forward from their anchor. They never
  // create a descendant collection or visit an unrelated sibling subtree.
  compileRelative =
    function(info) {
      if (!info.pure || !/^[>+~]$/.test(info.leading)) { return null; }
      var i, state = { next: 0, vars: [] }, code = 'return true;', node, parent, relation, condition;
      for (i = 0; i < info.relations.length; ++i) {
        if (!/^[>+~]$/.test(info.relations[i])) { return null; }
      }
      if (info.leading == '~' && info.relations.every(function(relation) { return relation == '~'; })) {
        code = 'e=anchor;';
        for (i = 0; i < info.compounds.length; ++i) {
          condition = compoundExpression(info.compounds[i].simple, state);
          code += 'e=e.nextElementSibling;while(e&&!(' + condition + ')){e=e.nextElementSibling;}if(!e)return false;';
        }
        code += 'return true;';
      } else {
        for (i = info.compounds.length - 1; i >= 0; --i) {
          node = 'b' + i; parent = i ? 'b' + (i - 1) : 'anchor';
          relation = i ? info.relations[i - 1] : info.leading;
          condition = compoundExpression(info.compounds[i].simple, state);
          if (condition == 'false') { return function() { return false; }; }
          code = 'e=' + node + ';if(' + condition + '){' + code + '}';
          code = relation == '+' ? 'var ' + node + '=' + parent + '.nextElementSibling;if(' + node + '){' + code + '}' :
            'for(var ' + node + '=' + parent + (relation == '>' ? '.firstElementChild' : '.nextElementSibling') +
            ';' + node + ';' + node + '=' + node + '.nextElementSibling){' + code + '}';
        }
      }
      code = '"use strict";return function Relative(anchor){var e' +
        (state.vars.length ? ',' + state.vars.join(',') : '') + ';' + code + 'return false;}';
      var factory = Function('s', code)(Snapshot);
      factory.cacheSize = code.length * 2 + 128;
      return factory;
    },

  candidatePlan =
    function(selector) {
      var info = selectorInfo(selector), part = info.compounds[info.compounds.length - 1].simple,
        names = [], i, token, kind = '*', name = '*', optimized = selector, seed;
      if (part && part.classes.length) {
        for (i = 0; i < part.classes.length; ++i) {
          if (!part.classes[i] || /[\t\n\f\r ]/.test(part.classes[i])) { names = []; break; }
          if (names.indexOf(part.classes[i]) < 0) { names.push(part.classes[i]); }
        }
      }
      if (names.length) {
        kind = '.'; name = names.join(' '); seed = { kind: kind, name: name };
      } else {
        token = selector.match(reOptimizer);
        if (token && token[1] != ':' && !(QUIRKS_MODE && token[1] == '#') && selector.indexOf('\\') < 0) {
          token[1] || (token[1] = '*');
          kind = token[1]; name = unescapeIdentifier(token[2]);
          optimized = optimize(selector, token);
        }
      }
      return { kind: kind, name: name, selector: optimized, seed: seed,
        sibling: /^[+~]/.test(selector), api: kind == '#' || kind == '*' && !HTML_DOCUMENT ? '' : method[kind],
        snapshot: info.effects, extension: info.extension };
    },

  compilePlan =
    function(selector, mode, relative) {
      var plan = candidatePlan(selector), factory;
      // Extensions can rewrite S_BODY and use candidate/result indexes.
      // Retain that compiler contract even for an internal early exit.
      factory = compile(plan.selector, plan.extension ? 3 : mode, null, relative, plan.seed);
      plan.empty = factory.empty;
      plan.cacheSize = factory.cacheSize + plan.selector.length * 2 + 128;
      if (plan.extension) {
        factory = (function(resolve) {
          return function(candidates, callback, context) {
            var nodes = resolve(candidates, null, context, []);
            return mode === 1 ? nodes.length > 0 : nodes[0] || null;
          };
        })(factory);
      }
      plan.factory = factory;
      return plan;
    },

  planCandidates =
    function(plan, context) {
      return plan.empty ? none : !plan.snapshot && plan.api in context ?
        context[plan.api](plan.name) : compat[plan.kind](context, plan.name)();
    },

  // equivalent of w3c 'querySelector' method
  first =
    function _querySelector(selectors, context, callback) {
      context || (context = doc);
      var previous = enterContext(context), resolver, parsed, plans, plan, node,
        firstNode = null, i, fallback = false;
      try {
        resolver = firstResolvers.get(selectors);
        if (!resolver) {
          parsed = parse(selectors, true);
          plans = [];
          for (i = 0; parsed && i < parsed.length; ++i) {
            plan = compilePlan(parsed[i], 2, false);
            plans.push(plan);
            fallback = fallback || plan.snapshot;
          }
          // Validate every branch before touching candidates. Effectful lists
          // retain full selection order and extension callback semantics.
          resolver = { plans: plans, fallback: plans.length > 1 && fallback, cacheSize: 64 };
          resolver.groups = !resolver.fallback && sharedPlans(parsed || [], plans);
          for (i = 0; i < plans.length; ++i) { resolver.cacheSize += plans[i].cacheSize; }
          if (resolver.groups) { resolver.cacheSize += resolver.groups.cacheSize; }
          firstResolvers.set(selectors, resolver);
        }
        if (resolver.fallback) {
          firstNode = select(selectors, context)[0] || null;
        } else {
          plans = resolver.groups || resolver.plans;
          for (i = 0; i < plans.length; ++i) {
            plan = plans[i];
            node = plan.matchers ? sharedScan(plan, context, true) :
              plan.factory(planCandidates(plan, context), null, context, null);
            if (node && (!firstNode || node.compareDocumentPosition(firstNode) & 4)) { firstNode = node; }
          }
        }
        if (firstNode && typeof callback == 'function') { callback(firstNode); }
        return firstNode;
      } finally { leaveContext(previous); }
    },

  // A union with the same candidate seed needs one collection and one scan.
  // Only pure branches participate, so reordering cannot dispatch events or
  // run extension code. Callback queries keep their original branch behavior.
  sharedPlans =
    function(selectors, plans) {
      var groups = [], indexes = Object.create(null), i, j, key, group, plan,
        shared = false, info, factory, size = 0;
      for (i = 0; i < plans.length; ++i) {
        plan = plans[i]; info = selectorInfo(selectors[i]);
        if (plan.snapshot || plan.extension) { return null; }
        key = JSON.stringify([plan.kind, plan.name]);
        j = info.pure && indexes[key];
        if (j === undefined || !info.pure) {
          if (info.pure) { indexes[key] = groups.length; }
          groups.push({ plans: [plan], pure: info.pure });
        } else { groups[j].plans.push(plan); shared = true; }
      }
      if (!shared) { return null; }
      for (i = 0; i < groups.length; ++i) {
        group = groups[i]; plan = group.plans[0];
        if (group.plans.length == 1) { groups[i] = plan; continue; }
        group.kind = plan.kind; group.name = plan.name; group.api = plan.api;
        group.matchers = [];
        for (j = 0; j < group.plans.length; ++j) {
          plan = group.plans[j];
          factory = compile(plan.selector, false, null, false, plan.seed);
          group.matchers.push(factory); size += factory.cacheSize;
        }
        delete group.plans;
      }
      groups.cacheSize = size;
      return groups;
    },

  sharedScan =
    function(plan, context, firstOnly, results) {
      var candidates = planCandidates(plan, context), i, element;
      // Bound logical matchers can share streamed nth positions for this scan.
      ++Snapshot.nthElementDepth; ++Snapshot.nthTypeDepth;
      try {
        for (i = 0; (element = candidates[i]); ++i) {
          if (match_assert(plan.matchers, element, null)) {
            if (firstOnly) { return element; }
            results.push(element);
          }
        }
        return null;
      } finally {
        if (!--Snapshot.nthElementDepth) { nthElement(null, 2); }
        if (!--Snapshot.nthTypeDepth) { nthOfType(null, 2); }
      }
    },

  // Bulk descendant :has can invert the search: find witnesses once, then
  // mark their ancestors. Eligibility is deliberately narrow and effect-free.
  bulkHasPlan =
    function(selector) {
      var info = selectorInfo(selector), i = 0, depth = 0, quote = '', c, logical,
        argument, outer, anchor, witness;
      if (info.effects || info.compounds.length != 1) { return null; }
      for (; i < selector.length; ++i) {
        c = selector[i];
        if (c == '\\') { i = escapeEnd(selector, i) - 1; continue; }
        if (quote) { if (c == quote) { quote = ''; } continue; }
        if (c == '"' || c == "'") { quote = c; continue; }
        if (!depth && c == ':' && (logical = matchLogical(selector.slice(i), /^:(has)\(/i))) { break; }
        if (c == '[' || c == '(') { ++depth; }
        else if (c == ']' || c == ')') { --depth; }
      }
      if (!logical) { return null; }
      argument = logical[2];
      info = selectorInfo(argument);
      // Scope/state dependencies and child/sibling paths stay with their
      // existing bounded plans. No live results survive this query.
      if (!info.pure || info.leading || info.compounds.length != 1 || argument.indexOf(':') > -1) { return null; }
      outer = selector.slice(0, i) + logical[3] || '*';
      if (!selectorInfo(outer).pure) { return null; }
      anchor = candidatePlan(outer); witness = candidatePlan(argument);
      if (witness.kind == '*' && witness.name == '*') { return null; }
      anchor.matcher = compile(anchor.selector, false, null, false, anchor.seed);
      witness.matcher = compile(witness.selector, false, null, false, witness.seed);
      return { anchor: anchor, witness: witness,
        cacheSize: anchor.matcher.cacheSize + witness.matcher.cacheSize + selector.length * 4 + 256 };
    },

  bulkHasScan =
    function(plan, context, results) {
      var anchors = planCandidates(plan.anchor, context), witnesses, marked, i, node;
      if (anchors.length < 32) { return false; }
      witnesses = planCandidates(plan.witness, context);
      // Dense witnesses favor the existing first-hit search per anchor.
      if (witnesses.length > anchors.length * 2) { return false; }
      if (!witnesses.length) { return true; }
      marked = new WeakSet();
      ++Snapshot.nthElementDepth; ++Snapshot.nthTypeDepth;
      try {
        for (i = 0; (node = witnesses[i]); ++i) {
          if (!plan.witness.matcher(node, null, null, false)) { continue; }
          node = node.parentElement;
          while (node && node !== context && !marked.has(node)) {
            marked.add(node); node = node.parentElement;
          }
        }
        for (i = 0; (node = anchors[i]); ++i) {
          if (marked.has(node) && plan.anchor.matcher(node, null, null, false)) { results.push(node); }
        }
        return true;
      } finally {
        if (!--Snapshot.nthElementDepth) { nthElement(null, 2); }
        if (!--Snapshot.nthTypeDepth) { nthOfType(null, 2); }
      }
    },

  // Read the small selector grammar that can use a one-pass general-sibling
  // walk. Everything else stays on the ordinary compiled-resolver path.
  parseSiblingChain =
    function(selector) {
      var parts = selector.split('~'), chain = [], part, match, i;
      if (parts.length < 2) return null;
      for (i = 0; i < parts.length; ++i) {
        part = parts[i].replace(/^[\t\n\f\r ]+|[\t\n\f\r ]+$/g, '');
        if (!part || /[\t\n\f\r ]|\\/.test(part)) return null;
        match =
          /^(\*|[-_a-zA-Z][-_a-zA-Z0-9]*)?(?:\.([-_a-zA-Z][-_a-zA-Z0-9]*))?$/.exec(
            part
          );
        if (!match || (!match[1] && !match[2])) return null;
        chain[chain.length] = { tag: match[1], cls: match[2] };
      }
      return chain;
    },

  // For simple general-sibling chains, candidates are ordered by parent.
  // Scanning each distinct parent once avoids repeating the left-side walk
  // for every later matching sibling.
  siblingChain =
    function(chain, context) {
      var last = chain.length - 1,
        part = chain[last],
        candidates, parents, results = [], parent, child, matched, i, l;
      if (!global.WeakSet || !context.getElementsByTagName) return null;
      candidates = part.cls
        ? context.getElementsByClassName(part.cls)
        : context.getElementsByTagName(part.tag == '*' ? '*' : part.tag);
      parents = new global.WeakSet();
      for (i = 0, l = candidates.length; i < l; ++i) {
        parent = candidates[i].parentElement;
        if (!parent || parents.has(parent)) continue;
        parents.add(parent);
        matched = 0;
        child = parent.firstElementChild;
        while (child) {
          if (matched < last) {
            if (matchesSiblingPart(child, chain[matched])) ++matched;
          } else if (matchesSiblingPart(child, part)) {
            results[results.length] = child;
          }
          child = child.nextElementSibling;
        }
      }
      return results.length > 1 ? results.sort(documentOrder) : results;
    },

  matchesSiblingPart =
    function(element, part) {
      if (part.tag && part.tag != '*') {
        if (element.namespaceURI == 'http://www.w3.org/1999/xhtml') {
          if (element.localName.toLowerCase() != part.tag.toLowerCase()) {
            return false;
          }
        } else if (element.localName != part.tag) {
          return false;
        }
      }
      return !part.cls || hasClass(element, part.cls);
    },

  // equivalent of w3c 'querySelectorAll' method
  select =
    function _querySelectorAll(selectors, context, callback) {
      arguments.length == 0 && emit(qsNotArgs, TypeError);
      context || (context = doc);
      var previous = enterContext(context), nodes = [], resolver, parsed,
        i, plan, plans, siblingNodes;
      try {
        resolver = selectResolvers.get(selectors);
        if (!resolver) {
          parsed = parse(selectors, true);
          resolver = collect(parsed || []);
          resolver.chain = parsed && parsed.length == 1 ? parseSiblingChain(parsed[0]) : null;
          selectResolvers.set(selectors, resolver);
        }
        if (!callback && resolver.chain && HTML_DOCUMENT && !QUIRKS_MODE && context.nodeType == 9) {
          siblingNodes = siblingChain(resolver.chain, context);
          if (siblingNodes !== null) { nodes = siblingNodes; }
        }
        if (siblingNodes === undefined || siblingNodes === null) {
          plans = !callback && resolver.groups || resolver.plans;
          for (i = 0; i < plans.length; ++i) {
            plan = plans[i];
            if (plan.empty) { continue; }
            if (plan.matchers) { sharedScan(plan, context, false, nodes); continue; }
            if (!callback && plan.bulk && bulkHasScan(plan.bulk, context, nodes)) { continue; }
            // Selection preserves a snapshot for extensions and callbacks.
            plan.factory(compat[plan.kind](context, plan.name)(), callback, context, nodes);
          }
          if (resolver.plans.length > 1 && nodes.length > 1) {
            nodes.sort(documentOrder);
            hasDupes && (nodes = unique(nodes));
          }
        }
        if (typeof callback == 'function') { nodes = concatCall(nodes, callback); }
        return !Config.NODE_LIST ? nodes : isInstanceOf(nodes) ? nodes : toNodeList(nodes);
      } finally { leaveContext(previous); }
    },

  // optimize selectors avoiding duplicated checks
  optimize =
    function(selector, token) {
      var index = token.index,
      length = token[1].length + token[2].length;
      return selector.slice(0, index) +
        (' >+~'.indexOf(selector.charAt(index - 1)) > -1 ?
          (':['.indexOf(selector.charAt(index + length + 1)) > -1 ?
          '*' : '') : '') + selector.slice(index + length - (token[1] == '*' ? 1 : 0));
    },

  // Plans contain no result arrays, document contexts or context closures.
  collect =
    function(selectors, relative) {
      var i, selector, plan, plans = [], seen = Object.create(null), factory = [], nodeset = [],
        kept = [], size = 64, groups;
      for (i = 0; i < selectors.length; ++i) {
        selector = selectors[i];
        if (seen[selector]) { continue; }
        seen[selector] = true;
        plan = candidatePlan(selector);
        plan.factory = compile(plan.selector, true, null, relative, plan.seed);
        plan.empty = plan.factory.empty;
        plan.cacheSize = plan.factory.cacheSize + plan.selector.length * 2 + 128;
        // Most selectors cannot use bulk :has planning. Avoid parsing every
        // selector with selectorInfo before checking this cheap prefix.
        plan.bulk = /:has\(/i.test(selector) ? bulkHasPlan(selector) : null;
        if (plan.bulk) { plan.cacheSize += plan.bulk.cacheSize; }
        size += plan.cacheSize;
        plans.push(plan);
        kept.push(selector);
        factory.push(plan.factory);
        nodeset.push(plan.kind + plan.name);
      }
      groups = sharedPlans(kept, plans);
      return { plans: plans, factory: factory, nodeset: nodeset, groups: groups,
        cacheSize: size + (groups ? groups.cacheSize : 0) };
    },

  // handlers needed for the :hover pseudo-class
  // track state change in browsers and headless
  initEnv =
    (function() {
      doc.addEventListener('mouseover', function(e) { Snapshot.HOVER = e.target; }, true);
      doc.addEventListener('mouseout', function(e) { Snapshot.HOVER = null; }, true);
    })(),

  // QSA placeholders to native references
  _closest, _matches,
  _querySelector, _querySelectorAll,
  _querySelectorDoc, _querySelectorAllDoc,

  // overrides QSA methods (only for browsers)
  install =
    function(all) {
      // save references
      _closest = Element.prototype.closest;
      _matches = Element.prototype.matches;

      _querySelector = Element.prototype.querySelector;
      _querySelectorAll = Element.prototype.querySelectorAll;

      _querySelectorDoc = Document.prototype.querySelector;
      _querySelectorAllDoc = Document.prototype.querySelectorAll;

      function parseQSArgs() {
        var method = arguments[arguments.length - 1];
        return (
          arguments.length < 2 ?
            method.apply(this, [ ]) :
          arguments.length < 3 ?
            method.apply(this, [ arguments[0], this ]) :
            method.apply(this, [ arguments[0], this,
              typeof arguments[1] == 'function' ? arguments[1] : undefined ]));
      }

      Element.prototype.closest =
      HTMLElement.prototype.closest =
        function closest() {
          return parseQSArgs.apply(this, [].slice.call(arguments).concat(ancestor));
        };

      Element.prototype.matches =
      HTMLElement.prototype.matches =
        function matches() {
          return parseQSArgs.apply(this, [].slice.call(arguments).concat(match));
        };

      Element.prototype.querySelector =
      HTMLElement.prototype.querySelector =
        function querySelector() {
          return parseQSArgs.apply(this, [].slice.call(arguments).concat(first));
        };

      Element.prototype.querySelectorAll =
      HTMLElement.prototype.querySelectorAll =
        function querySelectorAll() {
          return parseQSArgs.apply(this, [].slice.call(arguments).concat(select));
        };

      Document.prototype.querySelector =
      DocumentFragment.prototype.querySelector =
        function querySelector() {
          return parseQSArgs.apply(this, [].slice.call(arguments).concat(first));
        };

      Document.prototype.querySelectorAll =
      DocumentFragment.prototype.querySelectorAll =
        function querySelectorAll() {
          return parseQSArgs.apply(this, [].slice.call(arguments).concat(select));
      };

      if (all) {
        doc.addEventListener('load', function(e) {
          var c, d, r, s, t = e.target;
          if (/iframe/i.test(t.localName)) {
            c = '(' + Export + ')(this, ' + Factory + ');'; d = t.ownerDocument;
            s = d.createElement('script'); s.textContent = c + 'NW.Dom.install(true)';
            r = d.documentElement; r.removeChild(r.insertBefore(s, r.firstChild));
          }
        }, true);
      }

    },

  // restore QSA methods (only for browsers)
  uninstall =
    function() {
      // restore references
      if (_closest) {
        Element.prototype.closest = _closest;
        HTMLElement.prototype.closest = _closest;
      }
      if (_matches) {
        Element.prototype.matches = _matches;
        HTMLElement.prototype.matches = _matches;
      }
      if (_querySelector) {
        Element.prototype.querySelector =
        HTMLElement.prototype.querySelector = _querySelector;
        Element.prototype.querySelectorAll =
        HTMLElement.prototype.querySelectorAll = _querySelectorAll;
      }
      if (_querySelectorAllDoc) {
        Document.prototype.querySelector =
        DocumentFragment.prototype.querySelector = _querySelectorDoc;
        Document.prototype.querySelectorAll =
        DocumentFragment.prototype.querySelectorAll = _querySelectorAllDoc;
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

  // Relative existence plans contain code and tokens, never DOM results.
  hasResolvers = createCache(),
  firstResolvers = createCache(),
  forgivingResolvers = createCache(),
  selectorInfos = createCache(),
  logicalValidators = createCache(),
  parsedSelectors = createCache(),

  // passed to resolvers
  Snapshot = {

    doc: doc,
    from: doc,
    root: root,
    anchor: null,

    byTag: byTag,
    hasClass: hasClass,
    hasClassValue: hasClassValue,
    classOf: classOf,
    asciiLower: asciiLower,
    attributeMatches: attributeMatches,

    has: has,
    first: first,
    match: matchInner,
    matchForgiving: matchForgiving,
    select: select,

    ancestor: ancestor,

    nthOfType: nthOfType,
    nthElement: nthElement,
    nthWithin: nthWithin,
    nthFormula: nthFormula,
    isEmpty: isEmpty,
    clearNth: clearNth,
    checkValidity: checkValidity,
    nthElementDepth: 0,
    nthTypeDepth: 0,
    nthUncachedDepth: 0,

    isDefined: isDefined,
    matchesNative: matchesNative,
    isRequired: isRequired,
    isOpen: isOpen,
    isClosed: isClosed,
    isDisabled: isDisabled,
    isModal: isModal,
    isFullscreen: isFullscreen,
    isPictureInPicture: isPictureInPicture,
    isPopoverOpen: isPopoverOpen,
    isFocusable: isFocusable,
    isContentEditable: isContentEditable,
    isLink: isLink,
    isPlaying: isPlaying,
    hasAttributeNS: hasAttributeNS
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
    registerCombinator:
      function(combinator, resolver) {
        var i = 0, l = combinator.length, symbol;
        for (; l > i; ++i) {
          if (combinator[i] != '=') {
            symbol = combinator[i];
            break;
          }
        }
        if (CFG.combinators.indexOf(symbol) < 0) {
          CFG.combinators = CFG.combinators.replace('](', symbol + '](');
          CFG.combinators = CFG.combinators.replace('])', symbol + '])');
          Combinators[combinator] = resolver;
          clearResolverCaches();
          setIdentifierSyntax();
        } else {
          console.warn('Warning: the \'' + combinator + '\' combinator is already registered.');
        }
      },

    // register a new attribute operator symbol and its related function resolver
    registerOperator:
      function(operator, resolver) {
        var i = 0, l = operator.length, symbol;
        for (; l > i; ++i) {
          if (operator[i] != '=') {
            symbol = operator[i];
            break;
          }
        }
        if (CFG.operators.indexOf(symbol) < 0 && !Operators[operator]) {
          CFG.operators = CFG.operators.replace(']=', symbol + ']=');
          Operators[operator] = resolver;
          clearResolverCaches();
          setIdentifierSyntax();
        } else {
          console.warn('Warning: the \'' + operator + '\' operator is already registered.');
        }
      },

    // register a new selector symbol and its related function resolver
    registerSelector:
      function(name, rexp, func) {
        if (!Selectors[name]) {
          Selectors[name] = { Expression: rexp, Callback: func };
          // A previously invalid forgiving branch may now be supported.
          clearResolverCaches();
        }
      }
  };

  initialize(doc);

  return Dom;

});
