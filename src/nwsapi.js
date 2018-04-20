/*
 * Copyright (C) 2007-2018 Diego Perini
 * All rights reserved.
 *
 * nwsapi.js - Fast CSS Selectors API Engine
 *
 * Author: Diego Perini <diego.perini at gmail com>
 * Version: 2.0.0beta2
 * Created: 20070722
 * Release: 20180417
 *
 * License:
 *  http://javascript.nwbox.com/nwsapi/MIT-LICENSE
 * Download:
 *  http://javascript.nwbox.com/nwsapi/nwsapi.js
 */

(function Export(global, factory) {

  'use strict';

  if (typeof module === 'object' && typeof exports === 'object') {
    module.exports = factory;
  } else if (typeof define === 'function' && define['amd']) {
    define(factory);
  } else {
    global.NW || (global.NW = { });
    global.NW.Dom = factory(global, Export);
  }

})(this, function Factory(global, Export) {

  var version = 'nwsapi-2.0.0beta2',

  doc = global.document,
  root = doc.documentElement,

  COM = '>+~',
  ESC = '\\\\',
  HEX = '[0-9a-fA-F]',
  SPC = ' \\t\\r\\n\\f',
  WSP = '[' + SPC + ']',

  CFG = {
    operators: '[~*^$|]=|=',
    combinators: '[' + SPC + COM + '](?=[^' + COM + '])'
  },

  STR = {
    alphalodash: '[_a-zA-Z]',
    pseudoparms: '[-+]?\\d*',
    doublequote: '"[^"\\\\]*(?:\\\\.[^"\\\\]*)*"',
    singlequote: "'[^'\\\\]*(?:\\\\.[^'\\\\]*)*'",

    any_esc_chr: ESC + '.',
    non_asc_chr: '[^\\x00-\\x9f]',
    escaped_chr: ESC + '[^\\r\\n\\f0-9a-fA-F]',
    unicode_chr: ESC + HEX + '{1,6}(?:\\r\\n|' + WSP + ')?'
  },

  REX = {
    HasEscapes: RegExp(ESC),
    HexNumbers: RegExp('^' + HEX),
    SplitComma: RegExp('\\s?,\\s?'),
    EscOrQuote: RegExp('^\\\\|[\\x22\\x27]'),
    RegExpChar: RegExp('(?:(?!\\\\)[\\\\^$.*+?()[\\]{}|\\/])' ,'g'),
    TrimSpaces: RegExp('[\\r\\n\\f]|^' + WSP + '+|' + WSP + '+$', 'g'),
    FixEscapes: RegExp('\\\\(' + HEX + '{1,6}' + WSP + '?|.)|([\\x22\\x27])', 'g'),
    SplitGroup: RegExp(WSP + '*,' + WSP + '*(?![^\\[]*\\]|[^\\(]*\\)|[^\\{]*\\})', 'g')
  },

  reOptimizer,
  reSimpleNot,
  reValidator,

  struct_1 = '(?:root|empty|scope)|(?:(?:first|last|only)(?:-child|-of-type))',
  struct_2 = '(?:nth(?:-last)?(?:-child|-of-type))',
  pseudo_1 = 'any-link|link|visited|target|active|focus|hover',
  pseudo_2 = 'checked|disabled|enabled|selected|local-link(?:\\(\\d*\\))?|lang\\(([-\\w]{2,})\\)',
  pseudo_3 = 'default|indeterminate|optional|required|valid|invalid|in-range|out-of-range|read-only|read-write|placeholder-shown',
  pseudo_4 = 'after|before|first-letter|first-line',
  pseudo_5 = 'selection|backdrop|placeholder',
  params_1 = '(?:\\(\\s?(even|odd|(?:[-+]?\\d*n?)(?:[-+]?\\d+)?)\\s?\\))',
  negation = '|(?:matches|not)\\(\\s?(:' + struct_2 + params_1 + '|[^()]*)\\s?\\)',

  Patterns = {
    struct_n: RegExp('^:(' + struct_1 + ')?(.*)', 'i'),
    struct_p: RegExp('^:(' + struct_2 + params_1 + ')?(.*)', 'i'),
    spseudos: RegExp('^:(' + struct_1 + '|' + struct_2 + params_1 + ')?(.*)', 'i'),
    dpseudos: RegExp('^:(' + pseudo_1 + '|' + pseudo_2 + negation + ')?(.*)', 'i'),
    epseudos: RegExp('^:(:?(?:' + pseudo_4 + ')|:(?:' + pseudo_5 + '))?(.*)', 'i'),
    hpseudos: RegExp('^:(' + pseudo_3 + ')?(.*)', 'i'),
    children: RegExp('^' + WSP + '?\\>' + WSP + '?(.*)'),
    adjacent: RegExp('^' + WSP + '?\\+' + WSP + '?(.*)'),
    relative: RegExp('^' + WSP + '?\\~' + WSP + '?(.*)'),
    ancestor: RegExp('^' + WSP + '+(.*)'),
   universal: RegExp('^\\*(.*)'),
   namespace: RegExp('^(\\w+|\\*)?\\|(.*)')
  },

  reNthElem = RegExp('(:nth(?:-last)?-child)', 'i'),
  reNthType = RegExp('(:nth(?:-last)?-of-type)', 'i'),

  QUIRKS_MODE,
  HAS_DUPE_IDS,
  HTML_DOCUMENT,
  NAMESPACE_URI,

  ATTR_ID = 'e.id',

  ATTR_STD_OPS = {
    '=': 1, '^=': 1, '$=': 1, '|=': 1, '*=': 1, '~=': 1
  },

  FIX_ID = '(typeof(e.id)==="string"?e.id:e.getAttribute("id"))',

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
        if (false === callback(list[i] = nodes[i])) break;
        ++i;
      }
      return list;
    },

  toArray =
    function(nodes) {
      var l = nodes.length, list = Array(l);
      while (l) { --l; list[l] = nodes[l]; }
      return list;
    },

  switchContext =
    function(context, force) {
      var oldDoc = doc;
      doc = context.ownerDocument || context;
      if (force || oldDoc !== doc) {
        // force a new check for each document change
        // performed before the next select operation
        HAS_DUPE_IDS = undefined;
        root = doc.documentElement;
        HTML_DOCUMENT = isHTML(doc);
        NAMESPACE_URI = root.namespaceURI;
        QUIRKS_MODE = HTML_DOCUMENT &&
          doc.compatMode.indexOf('CSS') < 0;
        ATTR_ID = Config.BUGFIX_ID ? FIX_ID : 'e.id';
        Snapshot.doc = doc;
        Snapshot.root = root;
      }
      return (Snapshot.from = context);
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
  convertEscapes =
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
              REX.EscOrQuote.test(p1) ? substring :
              // \g \h \. \# etc
              p1;
          }
        ) : str;
    },

  method = {
    '#': 'getElementById',
    '*': 'getElementsByTagName',
    '.': 'getElementsByClassName'
    },

  compat,

  set_compat =
    function() {

      return !Config.FASTCOMMA ? {
        '#': function(c, n, z) { return function(e, f) { return byId(n, c); }; },
        '*': function(c, n, z) { return function(e, f) { return byTag(n, c); }; },
        '.': function(c, n, z) { return function(e, f) { return byClass(n, c); }; }
      } : {
        '#': function(c, n, z) { return function(e, f) { return validate(c, n, z, '#') ? z : (z = byId(n, c)); }; },
        '*': function(c, n, z) { return function(e, f) { return validate(c, n, z, '*') ? z : (z = byTag(n, c)); }; },
        '.': function(c, n, z) { return function(e, f) { return validate(c, n, z, '.') ? z : (z = byClass(n, c)); }; },
      };
    },

  domapi,

  set_domapi =
    function() {

      var mapped = {
        '@': function(c, n, z) { return function(e, f) { return byId(n, c); }; },
        '#': function(c, n, z) { return function(e, f) { if (e && z) return z; z = c.getElementById(n); return z = z ? [ z ] : none; };},
        '*': function(c, n, z) { return function(e, f) { if (e && z) return z; z = c.getElementsByTagName(n); return f ? concatCall(z, f) : toArray(z); };},
        '.': function(c, n, z) { return function(e, f) { if (e && z) return z; z = c.getElementsByClassName(n); return f ? concatCall(z, f) : toArray(z); };},
      };

      natives = mapped;
      if (HAS_DUPE_IDS) natives['#'] =  mapped['@'];
      delete natives['@'];

      return natives;
    },

  // check context for duplicate Ids
  hasDuplicateId =
    function(id, context) {
      var i = 0, cloned, element, fragment, r = Object();

      context = context.nodeType === 1 ?
        context : context.firstElementChild;

      if (typeof id === 'string') {

        cloned = context.cloneNode(true);
        fragment = doc.createDocumentFragment();
        fragment.appendChild(cloned);

        while ((element = fragment.getElementById(id))) {
          element.removeAttribute('id'); ++i;
          if (i > 1) { break; }
        }

      } else {

        e = context.getElementsByTagName('*');
        while (e[i]) {
          if (e[i].id) {
            if (!r[e[i].id]) {
              r[e[i].id] = true;
            } else return true;
          }
          ++i;
        }
        i = 0;
      }
      return i > 1;
    },

  // validate memoized HTMLCollections
  validate =
    function(context, ident, list, type) {
      var c, i, j, k, l, m, els, test;
      if (!list) { return false; }
      l = list.length;
      k = ident.length;
      m = method[type];
      for (i = 0; k > i; ++i) {
        els = context[m](ident[i]);
        if (!els) continue; test = toArray(els);
        for (j = 0, c = 0; l > j; ++j) {
          if (list[j] === test[c]) { ++c; }
        }
        if (test.length !== c) { return false; }
      }
      return true;
    },

  // recursive DOM LTR traversal, configurable by replacing
  // the conditional part (@) to accept returned elements
  walk =
    '"use strict"; var i = 0, r = []; return function w(e) {' +
    'if (@) { r[i] = e; ++i; } e = e.firstElementChild;' +
    'while (e) { w(e); e = e.nextElementSibling; }' +
    'return r; };',

  // coditional tests to accept returned elements in the
  // cross document methods: byId, byTag, byCls, byTagCls
  idTest = 't===' + FIX_ID,
  tagMatch = 'a||t.test(e.nodeName)',
  clsMatch = 'c.test(e.getAttribute?' +
    'e.getAttribute("class"):e.className)',

  // getElementById from context
  byId =
    function(id, context) {
      var element, elements, resolver;

      // unescape identifier
      id = unescapeIdentifier(id);
      id = id.replace(/\x00|\\$/g, '\ufffd');

      // check if the duplicate config option is enabled
      if (!HAS_DUPE_IDS) {
        // if available use the DOM API to collect the nodes
        if ('getElementById' in context) {
          return (element = context.getElementById(id)) ? [ element ] : none;
        }
      }

      // for non-elements contexts start from first element child
      context.nodeType !== 1 && (context = context.firstElementChild);

      // build the resolver and execute it
      resolver = Function('t', walk.replace('@', idTest))(id);
      elements = resolver(context);

      return elements;
    },

  // specialized getElementsByTagName
  // collect one or multiple tag names from context
  // @tag may be a tag name or an array of tag names
  byTag =
    function(tag, context) {
      var elements, resolver, nTag = '', reTag, any;

      if (typeof tag === 'string') { tag = [ tag ]; }

      // if available use the DOM API to collect the nodes
      if (tag.length < 2 && method['*'] in context) {
        return context[method['*'] + 'NS']('*', tag[0]);
      }

      // multiple tag names
      tag.map(function(e) {
        if (e === '*') { any = true; }
        else nTag += '|' + e.replace(REX.RegExpChar, '\\$&');
      });
      reTag = RegExp('^(?:' + nTag.slice(1) + ')$', 'i');

      // build the resolver and execute it
      resolver = Function('t, a', walk.replace('@', tagMatch))(reTag, any);
      elements = resolver(context);

      // remove possible non-element nodes from the collected nodes
      if (elements[0] && elements[0].nodeType !== 1) { elements.shift(); }

      return elements;
    },

  // specialized getElementsByClassName
  // collect one or multiple class names from context
  // @cls may be a class name or an array of class names
  byClass =
    function(cls, context) {
      var elements, resolver, nCls = '', reCls, cs;

      if (typeof cls === 'string') { cls = [ cls ]; }

      // if available use the DOM API to collect the nodes
      if (cls.length < 2 && method['.'] in context) {
        return context[method['.']](cls[0]);
      }

      // prepare the class name filter regexp
      cs = QUIRKS_MODE ? 'i' : '';

      // multiple class names
      cls.map(function(e) {
        nCls += '|' + e.replace(REX.RegExpChar, '\\$&');
      });
      reCls = RegExp('(^|\\s)' + nCls.slice(1) + '(\\s|$)', cs);

      // build the resolver and execute it
      resolver = Function('c', walk.replace('@', clsMatch))(reCls);
      elements = resolver(context);

      return elements;
    },

  // namespace aware hasAttribute
  // helper for XML/XHTML documents
  hasAttributeNS =
    function(e, name) {
      var i, l, attr = e.getAttributeNames();
      name = RegExp(':?' + name + '$', 'i');
      for (i = 0, l = attr.length; l > i; ++i) {
        if (name.test(attr[i])) return true;
      }
      return false;
    },

  // namespace aware getAttribute
  // helper for XML/XHTML documents
  getAttributeNS =
    function(e, name) {
      var i, l, attr = e.getAttributeNames();
      name = RegExp(':?' + name + '$', 'i');
      for (i = 0, l = attr.length; l > i; ++i) {
        if (name.test(attr[i])) return e.getAttribute(attr[i]);
      }
      return null;
    },

  // fast resolver for the :nth-child() and :nth-last-child() pseudo-classes
  nthElement = (function() {
    var parents = Array(), elements = Array();
    return function(element, dir) {
      // ensure caches are emptied after each run, invoking with dir = 2
      if (dir === 2) { parents.length = 0; elements.length = 0; return -1; }
      var e, i, j, l, parent = element.parentNode;
      if ((i = parents.indexOf(parent)) < 0) {
        i = parents.length;
        parents[i] = parent;
        elements[i] = Array();
        e = parent.firstElementChild;
        while (e) { elements[i].push(e); e = e.nextElementSibling; }
      }
      for (j = 0, l = elements[i].length; l > j; ++j) { if (elements[i][j] === element) break; }
      return dir ? l - j : j + 1;
    };
  })(),

  // fast resolver for the :nth-of-type() and :nth-last-of-type() pseudo-classes
  nthOfType = (function() {
    var parents = Array(), elements = Array();
    return function(element, dir) {
      // ensure caches are emptied after each run, invoking with dir = 2
      if (dir === 2) { parents.length = 0; elements.length = 0; return -1; }
      var e, i, j, l, name = element.nodeName, parent = element.parentNode;
      if ((i = parents.indexOf(parent)) < 0 || !(elements[i] && elements[i][name])) {
        i = parents.length;
        parents[i] = parent;
        elements[i] = Object();
        elements[i][name] = Array();
        e = parent.firstElementChild;
        while (e) { if (e.nodeName === name) elements[i][name].push(e); e = e.nextElementSibling; }
      }
      for (j = 0, l = elements[i][name].length; l > j; ++j) { if (elements[i][name][j] === element) break; }
      return dir ? l - j : j + 1;
    };
  })(),

  // elements inherit ancestor properties
  inherit =
    function(element, tag, property) {
      var name = element.nodeName;
      while(element.parentElement) {
        if (name === tag) { break; }
        element = element.parentElement;
        name = element.nodeName.toLowerCase();
      }
      return name === tag ? element : null;
    },

  // check if the document type is HTML
  isHTML =
    function(node) {
      var doc = node.ownerDocument || node, root = doc.documentElement;
      return doc.nodeType === 9 && ('body' in doc) && root.nodeName === 'HTML' &&
        doc.createElement('DiV').nodeName !== 'DiV' && doc.contentType.indexOf('/html') > 0;
    },

  // configure the engine to use special handling
  configure =
    function(option) {
      if (typeof option === 'string') { return !!Config[option]; }
      if (typeof option !== 'object') { return Config; }
      for (var i in option) {
        Config[i] = !!option[i];
        if (i === 'SIMPLENOT') {
          matchResolvers = { };
          selectResolvers = { };
        } else if (i === 'FASTCOMMA') {
          set_compat();
        }
      }
      setIdentifierSyntax();
      return true;
    },

  // centralized error and exceptions handling
  emit =
    function(message, proto) {
      var err;
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

  // special handling flags
  Config = {

    ESCAPECHR: true,
    NON_ASCII: true,
    SELECTOR3: true,
    UNICODE16: true,

    BUGFIX_ID: true,
    FASTCOMMA: true,

    SIMPLENOT: true,
    USE_HTML5: true,

    LOGERRORS: true,
    VERBOSITY: true
  },

  // execute the engine initialization code
  initialize =
    function(doc) {
      setIdentifierSyntax();
      lastMatchContext = doc;
      lastSelectContext = doc;
      switchContext(doc, true);
    },

  // build validation regexps used by the engine
  setIdentifierSyntax =
    function() {

      var identifier,
      extendedValidator,
      standardValidator,
      attrparser, attrvalues,
      attributes, attrmatcher,
      pseudoclass, pseudoparms,
      syntax = '', start = Config['SELECTOR3'] ? '-{2}|' : '';

      Config['NON_ASCII'] && (syntax += '|' + STR.non_asc_chr);
      Config['UNICODE16'] && (syntax += '|' + STR.unicode_chr);
      Config['ESCAPECHR'] && (syntax += '|' + STR.escaped_chr);

      syntax += (
        Config['UNICODE16'] ||
        Config['ESCAPECHR']) ? '' : '|' + STR.any_esc_chr;

      identifier = '\\-?' +
        '(?:' + start + STR.alphalodash + syntax + ')' +
        '(?:-|[0-9]|' + STR.alphalodash + syntax + ')*';

      attrparser = identifier +
        '|' + STR.doublequote +
        '|' + STR.singlequote;

      attrvalues = '([\\x22\\x27]?)((?!\\3)*|(?:\\\\?.)*?)\\3';

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
          WSP + '?' + '(i)?' + WSP + '?' +
        // see <EOF-token> https://drafts.csswg.org/css-syntax/#typedef-eof-token
        // allow mangled|unclosed selector syntax if at the end of the qSA string
        // needed to pass current WP tests and mimic browsers behavior 'a[href=#'
        '(?:\\]|$)';

      attrmatcher = attributes.replace(attrparser, attrvalues);

      pseudoparms =
          '(?:'  + STR.pseudoparms + ')' +
          '(?:n' + STR.pseudoparms + ')' ;

      pseudoclass =
        '(?:\\(' +
          '(?:' + pseudoparms + '?)?|' +
          // universal * &
          // namespace *|*
          '(?:\\*|\\|)|' +
          '(?:' +
            '(?::' + identifier +
            '(?:\\(' + pseudoparms + '?\\))?|' +
          ')|' +
          '(?:[.#]?' + identifier + ')|' +
          '(?:' + attributes + ')' +
        ')+\\))*';

      standardValidator =
        '(?=' + WSP + '?[^>+~(){}<>])' +
        '(?:' +
          // universal * &
          // namespace *|*
          '(?:\\*|\\|)|' +
          '(?:[.#]?' + identifier + ')+|' +
          '(?:' + attributes + ')+|' +
          '(?:::?' + identifier + pseudoclass + ')|' +
          '(?:' + WSP + '?' + CFG.combinators + WSP + '?)|' +
          '(?:' + WSP + '?,' + WSP + '?)' +
        ')+';

      reSimpleNot = RegExp(
        '^(' +
          // universal negation :not(*) &
          // namespace negation :not(*|*)
          '(?:\\*|\\*\\|\\*)|' +
          '(?!:not)' +
          '(?:[.:#]?' +
          '(?:' + identifier + ')+|' +
          '(?:\\([^()]*\\))' + ')+|' +
          '(?:' + attributes + ')+|' +
        ')$');

      reOptimizer = RegExp('(?:([.:#*]?)(' + identifier + ')(?:(?:\\[.*\\])|:[-\\w]+(?:\\(.*\\))?)*)$');

      Patterns.id = RegExp('^#(' + identifier + ')(.*)');
      Patterns.tagName = RegExp('^(' + identifier + ')(.*)');
      Patterns.className = RegExp('^\\.(' + identifier + ')(.*)');
      Patterns.attribute = RegExp('^(?:' + attrmatcher + ')(.*)');

      extendedValidator = standardValidator.replace(pseudoclass, '.*');

      reValidator = RegExp(Config.SIMPLENOT ?
        standardValidator : extendedValidator, 'g');
    },

  F_INIT = '"use strict";return function Resolver(c,f,x)',

  S_HEAD = 'var r=[],e,n,o,j=-1,k=-1',
  M_HEAD = 'var r=!1,e,n,o',

  S_LOOP = 'c=c(true);main:while(e=c[++k])',
  M_LOOP = 'e=c;',

  S_BODY = 'r[++j]=c[k];',
  M_BODY = '',

  S_TAIL = 'continue main;',
  M_TAIL = 'r=true;',

  S_TEST = 'if(f(c[k])){break main;}',
  M_TEST = 'f(c);',

  S_VARS = [ ],
  M_VARS = [ ],

  // compile groups or single selector strings into
  // executable functions for matching or selecting
  compile =
    function(groups, mode, callback) {

      var i, l, key, factory, selector, token, vars, res = '',
      head = '', loop = '', macro = '', source = '', seen = { };

      // make sure that the input string is an array
      if (typeof groups === 'string') groups = [groups];

      selector = groups.join(', ');
      key = selector + '_' + (mode ? '1' : '0') + (callback ? '1' : '0');

      switch (mode) {
        case true:
          if (selectLambdas[key]) { return selectLambdas[key]; }
          macro = S_BODY + (callback ? S_TEST : '') + S_TAIL;
          head = S_HEAD;
          loop = S_LOOP;
          break;
        case false:
          if (matchLambdas[key]) { return matchLambdas[key]; }
          macro = M_BODY + (callback ? M_TEST : '') + M_TAIL;
          head = M_HEAD;
          loop = M_LOOP;
          break;
        default:
          break;
      }

      for (i = 0, l = groups.length; l > i; ++i) {
        token = groups[i];
        if (!seen[token] && (seen[token] = true)) {
          source += compileSelector(token, macro, mode, callback, false);
        }
      }

      vars = S_VARS.join(',') || M_VARS.join(',');
      loop += mode ? '{' + source + '}' : source;

      if (mode && selector.indexOf(':nth') > -1) {
        loop += reNthElem.test(selector) ? 's.nthElement(null, 2);' : '';
        loop += reNthType.test(selector) ? 's.nthOfType(null, 2);' : '';
      }

      if (vars.length > 0) {
        S_VARS.length = 0;
        M_VARS.length = 0;
        vars = ',' + vars;
      }
      vars += ';';

      factory = Function('s', F_INIT + '{' + head + vars + loop + 'return r; }')(Snapshot);

      return mode ? (selectLambdas[key] = factory) : (matchLambdas[key] = factory);
    },

  // build conditional code to check components of selector strings
  compileSelector =
    function(expression, source, mode, callback, not) {

      // N is the negation pseudo-class flag
      // D is the default inverted negation flag
      var a, b, n, x_error = '', NS,
      N = not ? '!' : '', D = not ? '' : '!', pseudo,
      compat, expr, match, result, status, symbol, test,
      type, selector = expression, selector_string, vars;

      // the original 'select' or 'match' selector string
      // before normalization and optimization processing
      selector_string = mode ? lastSelected : lastMatched;

      // ensure selector has single whitespaces
      selector = selector.replace(/[\n\r\f]{1,2}/g, ' ');
      // isolate selector combinators/components
      selector = selector.replace(/\s?([>+~])\s?/g, '$1');

      while (selector) {

        // get namespace prefix if present or get first char of selector
        symbol = /^(?:\w+|\*)\|/.test(selector) ? '|' : selector.charAt(0);

        switch (symbol) {

          // universal resolver
          case '*':
            match = selector.match(Patterns.universal);
            source = 'if(' + N + 'true' +
              '){' + source + '}';
            break;
          // id resolver
          case '#':
            match = selector.match(Patterns.id);
            compat = HTML_DOCUMENT ? ATTR_ID : 'e.getAttribute("id")';
            source = 'if(' + N + '(' + compat + '==="' + convertEscapes(match[1]) + '"' +
              ')){' + source + '}';
            break;
          // class name resolver
          case '.':
            match = selector.match(Patterns.className);
            compat = HTML_DOCUMENT ? 'e.className' : 'e.getAttribute("class")';
            source = 'if(' + N + '(/(^|\\s)' + match[1] + '(\\s|$)/.test(' + compat + ')' +
              ')){' + source + '}';
            break;
          // tag name resolver
          case (symbol.match(/[a-zA-Z]/) ? symbol : undefined):
            match = selector.match(Patterns.tagName);
            compat = HTML_DOCUMENT ? match[1].toUpperCase() : match[1];
            source = 'if(' + N + '(' +
                'e.localName==="' + match[1] + '"' +
                '||e.nodeName==="' + compat + '"' +
              ')){' + source + '}';
            break;
          // namespace resolver
          case '|':
            match = selector.match(Patterns.namespace);
            NS = match[1] || null;
            if (match[1] === '*') {
              source = 'if(' + N + 'true){' + source + '}';
            } else if (!match[1]) {
              source = 'if(' + N + '(!e.namespaceURI)){' + source + '}';
            } else if (typeof match[1] === 'string' && root.prefix === match[1]) {
              source = 'if(' + N + '(e.namespaceURI==="' + NAMESPACE_URI + '")){' + source + '}';
            } else {
              emit('\'' + selector_string + '\' is not a valid selector');
            }
            break;
          // attributes resolver
          case '[':
            match = selector.match(Patterns.attribute);
            expr = match[1].split(':');
            expr = expr.length === 2 ? expr[1] : expr[0];
            if (match[2] && !(test = Operators[match[2]])) {
              emit('unsupported operator in attribute selector \'' + selector + '\'');
              return '';
            }
            if (match[4] === '') {
              test = match[2] === '~=' ?
                { p1: '^\\s', p2: '+$', p3: 'true' } :
                  match[2] in ATTR_STD_OPS && match[2] !== '~=' ?
                { p1: '^',    p2: '$',  p3: 'true' } : test;
            } else {
              // whitespace separated list but value contains space
              if (match[2] === '~=' && match[4].indexOf(' ') > -1) {
                source = 'if(' + N + 'false){' + source + '}';
                break;
              }
            }
            type = !HTML_DOCUMENT || !HTML_TABLE[expr.toLowerCase()] ? '' : 'i';
            source = 'if(' + N + '(' + (!match[2] ?
              '(e.namespaceURI!=="' + NAMESPACE_URI + '")?' +
              's.hasAttributeNS(e,"' + match[1] + '"):' +
              'e.hasAttribute("' + match[1] + '")' :
              (!match[4] && match[2] in ATTR_STD_OPS && match[2] !== '~=' ?
              'e.getAttribute("' + match[1] + '")===""' :
              '(/' + test.p1 + convertEscapes(match[4]).
              replace(REX.RegExpChar, '\\$&') + test.p2 + '/' + type +
              ').test(e.getAttribute("' + match[1] + '"))===' + test.p3)) +
              ')){' + source + '}';
            break;

          // *** General sibling combinator
          // E ~ F (F relative sibling of E)
          case '~':
            match = selector.match(Patterns.relative);
            source = 'if(' + N + '(e.previousElementSibling)){n=e;e=e.parentNode.firstElementChild;while(e&&e!==n){' + source + 'e=e.nextElementSibling;}e=n;}';
            break;
          // *** Adjacent sibling combinator
          // E + F (F adiacent sibling of E)
          case '+':
            match = selector.match(Patterns.adjacent);
            source = 'if(' + N + '(e.previousElementSibling)){n=e;if(e=e.previousElementSibling){' + source + '}e=n;}';
            break;
          // *** Descendant combinator
          // E F (E ancestor of F)
          case '\x09':
          case '\x20':
            match = selector.match(Patterns.ancestor);
            source = 'n=e;while(e=e.parentElement){' + source + '}e=n;';
            break;
          // *** Child combinator
          // E > F (F children of E)
          case '>':
            match = selector.match(Patterns.children);
            source = 'n=e;if(e=e.parentElement){' + source + '}e=n;';
            break;

          case (symbol in Combinators ? symbol : undefined):
            // for other registered combinators extensions
            match[match.length - 1] = '*';
            source = Combinators[symbol](match) + source;
            break;

          // *** Structural pseudo-classes
          // :root, :scope, :empty,
          // :first-child, :last-child, :only-child,
          // :first-of-type, :last-of-type, :only-of-type,
          // :nth-child(), :nth-last-child(), :nth-of-type(), :nth-last-of-type()
          case ':':
            if ((match = selector.match(Patterns.struct_n)) && match[1]) {
              pseudo = match[1].match(/^[-\w]+/)[0].toLowerCase();
              switch (pseudo) {
                case 'scope':
                  source = 'if((x||e).contains(e)){' + source + '}';
                  break;
                case 'root':
                  // there can only be one :root element, so exit the loop once found
                  source = 'if(' + N + '(e===s.root)){' + source + (mode ? 'break main;' : '') + '}';
                  break;
                case 'empty':
                  source = 'n=e.firstChild;while(n&&!(/1|3/).test(n.nodeType)){n=n.nextSibling}if(' + D + 'n){' + source + '}';
                  break;
                case 'only-child':
                  source = 'if(' + N + '(e.parentNode.firstElementChild===e.parentNode.lastElementChild)){' + source + '}';
                  break;
                case 'last-child':
                  source = 'if(' + N + '(e===e.parentNode.lastElementChild)){' + source + '}';
                  break;
                case 'first-child':
                  source = 'if(' + N + '(e===e.parentNode.firstElementChild)){' + source + '}';
                  break;
                case 'only-of-type':
                  source = 'o=e.nodeName;' +
                    'n=e;while((n=n.nextElementSibling)&&n.nodeName!==o);if(!n){' +
                    'n=e;while((n=n.previousElementSibling)&&n.nodeName!==o);}if(' + D + 'n){' + source + '}';
                  break;
                case 'last-of-type':
                  source = 'n=e;o=e.nodeName;while((n=n.nextElementSibling)&&n.nodeName!==o);if(' + D + 'n){' + source + '}';
                  break;
                case 'first-of-type':
                  source = 'n=e;o=e.nodeName;while((n=n.previousElementSibling)&&n.nodeName!==o);if(' + D + 'n){' + source + '}';
                  break;
                default:
                  emit('\'' + selector_string + '\' is not a valid selector' + x_error);
                  break;
              }
            }

            else if ((match = selector.match(Patterns.struct_p)) && match[1]) {
              pseudo = match[1].match(/^[-\w]+/)[0].toLowerCase();
              switch (pseudo) {
                case 'nth-child':
                case 'nth-of-type':
                case 'nth-last-child':
                case 'nth-last-of-type':
                  // 4 cases: 1 (nth) x 4 (child, of-type, last-child, last-of-type)
                  expr = /-of-type/i.test(match[1]);
                  if (match[1] && match[2]) {
                    type = /last/i.test(match[1]);
                    if (match[2] === 'n') {
                      source = 'if(' + N + 'true){' + source + '}';
                      break;
                    } else if (match[2] === 'even' || match[2] === '2n0' || match[2] === '2n+0' || match[2] === '2n') {
                      test = 'n%2===0';
                    } else if (match[2] === 'odd' || match[2] === '2n1' || match[2] === '2n+1') {
                      test = 'n%2===1';
                    } else {
                      f = /n/i.test(match[2]);
                      n = match[2].split('n');
                      a = parseInt(n[0], 10) || 0;
                      b = parseInt(n[1], 10) || 0;
                      if (n[0] === '-') { a = -1; }
                      if (n[0] === '+') { a = +1; }
                      test = (b ? '(n' + (b > 0 ? '-' : '+') + Math.abs(b) + ')' : 'n') + '%' + a + '===0' ;
                      test =
                        a >= +1 ? (f ? 'n>' + (b - 1) + (Math.abs(a) !== 1 ? '&&' + test : '') : 'n===' + a) :
                        a <= -1 ? (f ? 'n<' + (b + 1) + (Math.abs(a) !== 1 ? '&&' + test : '') : 'n===' + a) :
                        a === 0 ? (n[0] ? 'n===' + b : 'n>' + (b - 1)) : 'false';
                    }
                    expr = expr ? 'OfType' : 'Element';
                    type = type ? 'true' : 'false';
                    source = 'n=s.nth' + expr + '(e,' + type + ');if(' + N + '(' + test + ')){' + source + '}';
                  } else {
                    emit('\'' + selector_string + '\' is not a valid selector' + x_error);
                  }
                  break;
                default:
                  emit('\'' + selector_string + '\' is not a valid selector' + x_error);
                  break;
              }
            }

            else if ((match = selector.match(Patterns.dpseudos)) && match[1]) {
              pseudo = match[1].match(/^[-\w]+/)[0].toLowerCase();
              switch (pseudo) {
                case 'matches':
                  expr = match[3].replace(REX.TrimSpaces, '');
                  source = 'if(s.match("' + expr.replace(/\x22/g, '\\"') + ',e")){' + source + '}';
                  break;
                case 'not':
                  if (Config.SIMPLENOT && !reSimpleNot.test(match[3])) {
                    emit('\'' + selector + '\' is not a valid selector');
                    return '';
                  }
                  expr = match[3].replace(REX.TrimSpaces, '');
                  source = compileSelector(expr, source, false, callback, true);
                  break;
                case 'checked':
                  source = 'if(' + N + '((/^input$/i.test(e.nodeName)&&' +
                    '(/^(?:radio|checkbox)$/i).test(e.type)&&e.checked)||' +
                    '(/^option$/i.test(e.nodeName)&&(e.selected||e.checked))' +
                    ')){' + source + '}';
                  break;
                case 'disabled':
                  // https://www.w3.org/TR/html5/forms.html#enabling-and-disabling-form-controls:-the-disabled-attribute
                  source =
                    'if(' + N + '(("form" in e||/^optgroup$/i.test(e.nodeName))&&' +
                      '"disabled" in e &&(e.disabled===true||' +
                      '(n=s.inherit(e,"fieldset"))&&(n=s.first("legend",n))&&!n.contains(e))' +
                    ')){' + source + '}';
                  break;
                case 'enabled':
                  source =
                    'if(' + N + '(("form" in e||/^optgroup$/i.test(e.nodeName))&&' +
                      '"disabled" in e &&e.disabled===false' +
                    ')){' + source + '}';
                  break;
                case 'lang':
                  test = '';
                  match[2] = match[2].toLowerCase();
                  if (match[2]) test = match[2].substr(0, 2) + '-';
                  source = 'do{if((' + N + '(s.doc.compareDocumentPosition(e)&16)&&' +
                    '(e.lang||"")===""&&s.root.lang==="' + match[2] + '"||' +
                    '(e.lang&&(e.lang.toLowerCase()==="' + match[2] + '"||' +
                    '(e.lang.substr(0,3)==="' + test + '")))' +
                    ')){' + source + '}}while(e!==s.root&&(e=e.parentElement));';
                  break;
                case 'target':
                  source = 'if(' + N + '((s.doc.compareDocumentPosition(e)&16)&&s.doc.location.hash&&e.id===s.doc.location.hash.slice(1))){' + source + '}';
                  break;
                case 'link':
                  source = 'if(' + N + '(/^a|area|link$/i.test(e.nodeName)&&e.hasAttribute("href"))){' + source + '}';
                  break;
                case 'visited':
                  source = 'if(' + N + '(/^a|area|link$/i.test(e.nodeName)&&e.hasAttribute("href")&&e.visited)){' + source + '}';
                  break;
                case 'active':
                  source = 'hasFocus' in doc && doc.hasFocus() ? 'if(' + N + '(e===s.doc.activeElement)){' + source + '}' : source;
                  break;
                case 'hover':
                  source = 'hasFocus' in doc && doc.hasFocus() ? 'if(' + N + '(e===s.doc.hoverElement)){' + source + '}' : source;
                  break;
                case 'focus':
                  source = 'hasFocus' in doc ?
                    'if(' + N + '(e===s.doc.activeElement&&s.doc.hasFocus()&&(e.type||e.href||typeof e.tabIndex==="number"))){' + source + '}' :
                    'if(' + N + '(e===s.doc.activeElement&&(e.type||e.href))){' + source + '}';
                  break;
                case 'selected':
                  source = 'if(' + N + '(/^option$/i.test(e.nodeName)&&(e.selected||e.checked))){' + source + '}';
                  break;
                default:
                  emit('\'' + selector_string + '\' is not a valid selector' + x_error);
                  break;
              }
            }

            // Level 4 pseudo-classes for form validation (was web-forms)
            else if ((match = selector.match(Patterns.hpseudos)) && match[1]) {
              pseudo = match[1].match(/^[-\w]+/)[0].toLowerCase();
              switch (pseudo) {
                case 'default':
                  source =
                    'if(' + N + '("form" in e && e.form)){' +
                      'var x=0;n=[];' +
                      'if(e.type==="image")n=e.form.getElementsByTagName("input");' +
                      'if(e.type==="submit")n=e.form.elements;' +
                      'while(n[x]&&e!==n[x]){' +
                        'if(n[x].type==="image")break;' +
                        'if(n[x].type==="submit")break;' +
                        'x++;' +
                      '}' +
                    '}' +
                    'if(' + N + '(e.form&&(e===n[x]&&/^image|submit$/i.test(e.type))||' +
                      '((/^option$/i.test(e.nodeName))&&e.defaultSelected)||' +
                      '((/^(radio|checkbox)$/i.test(e.type))&&e.defaultChecked)' +
                    ')){' + source + '}';
                  break;
                case 'indeterminate':
                  source =
                    'if(' + N + '(/^progress$/i.test(e.nodeName)&&!e.hasAttribute("value"))||' +
                      '(/^input$/i.test(e.nodeName)&&(/^checkbox$/i.test(e.type)&&e.indeterminate)||' +
                      '(/^radio$/i.test(e.type)&&e.name&&!s.first("input[name="+e.name+"]:checked",e.form))' +
                    ')){' + source + '}';
                  break;
                case 'optional':
                  source =
                    'if(' + N +
                      '(/^input|select|textarea$/i.test(e.nodeName)&&!e.required)' +
                    '){' + source + '}';
                  break;
                case 'required':
                  source =
                    'if(' + N +
                      '(/^input|select|textarea$/i.test(e.nodeName)&&e.required)' +
                    '){' + source + '}';
                  break;
                case 'read-write':
                  source =
                    'if(' + N + '(' +
                      '((/^textarea$/i.test(e.nodeName)&&!e.readOnly&&!e.disabled)||' +
                      '(/^password|text$/i.test(e.type)&&!e.readOnly&&!e.disabled))||' +
                      '(e.hasAttribute("contenteditable")||(s.doc.designMode==="on"))' +
                    ')){' + source + '}';
                  break;
                case 'read-only':
                  source =
                    'if(' + N + '(' +
                      '(/^textarea$/i.test(e.nodeName)&&(e.readOnly||e.disabled))||' +
                      '(/^password|text$/i.test(e.type)&&e.readOnly)' +
                    ')){' + source + '}';
                  break;
                case 'invalid':
                  source =
                    'if(' + N + '((' +
                      '(/^form$/i.test(e.nodeName)&&!e.noValidate)||' +
                      '(e.willValidate&&!e.formNoValidate))&&!e.checkValidity())||' +
                      '(/^fieldset$/i.test(e.nodeName)&&s.first(":invalid",e))' +
                    '){' + source + '}';
                  break;
                case 'valid':
                  source =
                    'if(' + N + '((' +
                      '(/^form$/i.test(e.nodeName)&&!e.noValidate)||' +
                      '(e.willValidate&&!e.formNoValidate))&&e.checkValidity())||' +
                      '(/^fieldset$/i.test(e.nodeName)&&s.first(":valid",e))' +
                    '){' + source + '}';
                  break;
                case 'in-range':
                  source =
                    'if(' + N +
                      '(/^input$/i.test(e.nodeName))&&' +
                      '(e.willValidate&&!e.formNoValidate)&&' +
                      '(!e.validity.rangeUnderflow&&!e.validity.rangeOverflow)&&' +
                      '(/^date|datetime-local|month|number|range|time|week$/i.test(e.type))&&' +
                      '(/^range$/i.test(e.type)||e.getAttribute("min")||e.getAttribute("max"))' +
                    '){' + source + '}';
                  break;
                case 'out-of-range':
                  source =
                    'if(' + N +
                      '(/^input$/i.test(e.nodeName))&&' +
                      '(e.willValidate&&!e.formNoValidate)&&' +
                      '(e.validity.rangeUnderflow||e.validity.rangeOverflow)&&' +
                      '(/^date|datetime-local|month|number|range|time|week$/i.test(e.type))&&' +
                      '(/^range$/i.test(e.type)||e.getAttribute("min")||e.getAttribute("max"))' +
                    '){' + source + '}';
                  break;
                case 'placeholder-shown':
                  source =
                    'if(' + N + '(' +
                      'e.hasAttribute("placeholder")&&' +
                      '!s.match(":focus",e)' +
                    ')){' + source + '}';
                  break;
                default:
                  emit('\'' + selector_string + '\' is not a valid selector' + x_error);
                  break;
              }
            }

            // allow pseudo-elements as :after/:before (single or double colon)
            else if ((match = selector.match(Patterns.epseudos)) && match[1]) {
              source = 'if(' + D + '(/1|11/).test(e.nodeType)){' + source + '}';
            }

            else {

              // reset
              expr = false;
              status = false;

              // process registered selector extensions
              for (expr in Selectors) {
                if ((match = selector.match(Selectors[expr].Expression)) && match[1]) {
                  result = Selectors[expr].Callback(match, source, mode, callback);
                  if ('match' in result) { match = result.match; }
                  vars = result.modvar;
                  if (mode) {
                     // add extra needed variables to the selector resolver
                     vars && S_VARS.indexOf(vars) < 0 && (S_VARS[S_VARS.length] = vars);
                  } else {
                     // add extra needed variables to the matcher resolver
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
                emit('unknown pseudo-class selector \'' + selector + '\'');
                return '';
              }

              if (!expr) {
                emit('unknown token in selector \'' + selector + '\'');
                return '';
              }

            }
            break;

        default:
          emit('\'' + selector_string + '\' is not a valid selector' + x_error);
          break;

        }
        // end of switch symbol

        if (!match) {
          emit('\'' + selector_string + '\' is not a valid selector' + x_error);
          return '';
        }

        // pop last component
        selector = match.pop();
      }
      // end of while selector

      return source;
    },

  // optimize selectors removing already checked components
  optimize =
    function(expression, token) {
      var index = token.index,
      length = token[1].length + token[2].length;
      return expression.slice(0, index) +
        (' >+~'.indexOf(expression.charAt(index - 1)) > -1 ?
          (':['.indexOf(expression.charAt(index + length + 1)) > -1 ?
          '*' : '') : '') + expression.slice(index + length);
    },

  // parse selector groups in an array
  parseGroup =
    function(selector) {
      var i, l,
      groups = selector.
        replace(/,\s?,/g, ',').
        replace(/\\,/g, '\ufffd').
        split(REX.SplitGroup);
      for (i = 0, l = groups.length; l > i; ++i) {
        groups[i] = groups[i].replace(/\ufffd/g, '\\,');
      }
      return groups;
    },

  // equivalent of w3c 'closest' method
  ancestor =
    function _closest(selector, element, callback) {
      while (element) {
        if (match(selector, element)) break;
        element = element.parentElement;
      }
      return element;
    },

  // equivalent of w3c 'matches' method
  match =
    function _matches(selector, element, callback) {

      var expression, groups;

      lastMatched = selector;

      if (element && matchResolvers[selector]) {
        return !!matchResolvers[selector](element, callback);
      }

      // arguments validation
      if (arguments.length === 0) {
        emit('not enough arguments', TypeError);
        return Config.VERBOSITY ? undefined : false;
      } else if (arguments[1] === '') {
        emit('\'\' is not a valid selector');
        return Config.VERBOSITY ? undefined : false;
      }

      // selector NULL or UNDEFINED
      if (typeof selector !== 'string') {
        selector = '' + selector;
      }

      // normalize selector
      expression = selector.
        replace(/\x00|\\$/g, '\ufffd').
        replace(REX.TrimSpaces, '');

      // parse and validate expression and split possible selector groups
      if ((groups = expression.match(reValidator)) && groups.join('') === expression) {
        groups = /\,/.test(expression) ? parseGroup(expression) : [expression];
        if (groups.indexOf('') > -1) {
          emit('invalid or illegal string specified');
          return Config.VERBOSITY ? undefined : false;
        }
      } else {
        emit('\'' + selector + '\' is not a valid selector');
        return Config.VERBOSITY ? undefined : false;
      }

      if (!matchResolvers[selector]) {
        matchResolvers[selector] = compile(groups, false, callback);
      }

      return !!matchResolvers[selector](element, callback);
    },

  // equivalent of w3c 'querySelector' method
  first =
    function _querySelector(selector, context, callback) {
      if (arguments.length === 0) {
        emit('not enough arguments', TypeError);
      }
      return select(selector, context,
        typeof callback === 'function' ?
        function firstMatch(element) {
          callback(element);
          return false;
        } :
        function firstMatch() {
          return false;
        }
      )[0] || null;
    },

  // equivalent of w3c 'querySelectorAll' method
  select =
    function _querySelectorAll(selector, context, callback) {

      var expression, groups, resolver, token;

      lastSelected = selector;

      context || (context = doc);

      if (selector && !callback && (resolver = selectResolvers[selector])) {
        if (resolver.context === context) {
          return resolver.factory(resolver.builder, callback, context);
        }
      }

      if (HAS_DUPE_IDS === undefined) {
        HAS_DUPE_IDS = hasDuplicateId(null, context);
        compat = set_compat();
        domapi = set_domapi();
      }

      // arguments validation
      if (arguments.length === 0) {
        emit('not enough arguments', TypeError);
        return Config.VERBOSITY ? undefined : none;
      } else if (arguments[0] === '') {
        emit('\'\' is not a valid selector');
        return Config.VERBOSITY ? undefined : none;
      } else if (lastSelectContext !== context) {
        lastSelectContext = switchContext(context);
      }

      // selector NULL or UNDEFINED
      if (typeof selector !== 'string') {
        selector = '' + selector;
      }

      // normalize selector
      expression = selector.
        replace(/\x00|\\$/g, '\ufffd').
        replace(REX.TrimSpaces, '');

      // parse and validate expression and split possible selector groups
      if ((groups = expression.match(reValidator)) && groups.join('') === expression) {
        groups = /\,/.test(expression) ? parseGroup(expression) : [expression];
        if (groups.indexOf('') > -1) {
          emit('invalid or illegal string specified');
          return Config.VERBOSITY ? undefined : none;
        }
      } else {
        emit('\'' + selector + '\' is not a valid selector');
        return Config.VERBOSITY ? undefined : none;
      }

      // prepare factory and closure for specific document types
      resolver = collect(
        groups.length < 2 ? expression : groups, context, callback,
        HTML_DOCUMENT && context.nodeType !== 11 ? domapi : compat);

      // save/reuse factory and closure collection
      if (!selectResolvers[selector] && !callback) {
        selectResolvers[selector] = {
          builder: resolver.builder,
          factory: resolver.factory,
          context: context
        };
      }

      return resolver.factory(resolver.builder, callback, context);
    },

  // prepare factory resolvers and closure collections
  collect =
    function(expression, context, callback, resolvers) {
      var builder, factory, ident, symbol, token;
      if (typeof expression === 'string') {
        if ((token = expression.match(reOptimizer)) && (ident = token[2])) {
          symbol = token[1] || '*';
          ident = unescapeIdentifier(ident);
          if (!(symbol === '#' && context.nodeType === 1)) {
            if ('.#*'.indexOf(symbol) > -1) {
              builder = resolvers[symbol](context, ident);
              if (HTML_DOCUMENT && context.nodeType !== 11) {
                expression = optimize(expression, token);
              }
            }
          }
        }
      } else {
        var tn = Array(), ts = Object(), cn = Array(), cs = Object();
        for (var i = 0, l = expression.length; l > i; ++i) {
          if ((token = expression[i].match(reOptimizer)) && (ident = token[2])) {
            symbol = token[1] || '*';
            ident = unescapeIdentifier(ident);
          }
          if (symbol === '*') { if (!ts[ident] && (ts[ident] = true)) { tn.push(ident); }}
          if (symbol === '.') { if (!cs[ident] && (cs[ident] = true)) { cn.push(ident); }}
        }
        if (tn.length === l) {
          builder = compat['*'](context, tn);
        } else if (cn.length === l) {
          builder = compat['.'](context, cn);
        } else {
          builder = compat['*'](context, '*');
        }
      }
      return {
        builder: builder || resolvers['*'](context, '*'),
        factory: factory || compile(expression, true, callback)
      };
    },

  // Query Selector API placeholders to native references
  _closest, _matches, _querySelector, _querySelectorAll,

  // overrides Query Selector API methods (only for browsers)
  install =
    function(all) {

      // save native QSA references
      _closest = Element.prototype.closest;
      _matches = Element.prototype.matches;
      _querySelector = Document.prototype.querySelector;
      _querySelectorAll = Document.prototype.querySelectorAll;

      Element.prototype.closest =
        function closest() {
          var ctor = Object.getPrototypeOf(this).__proto__.__proto__.constructor.name;
          if (!('nodeType' in this)) { emit('\'closest\' called on an object that does not implement interface ' + ctor + '.', TypeError); }
          return arguments.length < 1 ? ancestor.apply(this, [ ]) :
                 arguments.length < 2 ? ancestor.apply(this, [ arguments[0], this ]) :
                                        ancestor.apply(this, [ arguments[0], this, arguments[1] ]);
        };

      Element.prototype.matches =
        function matches() {
          var ctor = Object.getPrototypeOf(this).__proto__.__proto__.constructor.name;
          if (!('nodeType' in this)) { emit('\'matches\' called on an object that does not implement interface ' + ctor + '.', TypeError); }
          return arguments.length < 1 ? match.apply(this, [ ]) :
                 arguments.length < 2 ? match.apply(this, [ arguments[0], this ]) :
                                        match.apply(this, [ arguments[0], this ]);
        };

      Element.prototype.querySelector =
      Document.prototype.querySelector =
      DocumentFragment.prototype.querySelector =
        function querySelector() {
          var ctor = Object.getPrototypeOf(this).__proto__.__proto__.constructor.name;
          if (!('nodeType' in this)) { emit('\'querySelector\' called on an object that does not implement interface ' + ctor + '.', TypeError); }
          return arguments.length < 1 ? first.apply(this, [ ]) :
                 arguments.length < 2 ? first.apply(this, [ arguments[0], this ]) :
                                        first.apply(this, [ arguments[0], this, arguments[1] ]);
        };

      Element.prototype.querySelectorAll =
      Document.prototype.querySelectorAll =
      DocumentFragment.prototype.querySelectorAll =
        function querySelectorAll() {
          var ctor = Object.getPrototypeOf(this).__proto__.__proto__.constructor.name;
          if (!('nodeType' in this)) { emit('\'querySelectorAll\' called on an object that does not implement interface ' + ctor + '.', TypeError); }
          return arguments.length < 1 ? select.apply(this, [ ]) :
                 arguments.length < 2 ? select.apply(this, [ arguments[0], this ]) :
                                        select.apply(this, [ arguments[0], this, arguments[1] ]);
        };

      if (all) {
        document.addEventListener('load', function(e) {
          var c, d, r, s, t = e.target;
          if (/iframe/i.test(t.nodeName)) {
            c = '(' + Export + ')(this, ' + Factory + ');'; d = t.contentDocument;
            s = d.createElement('script'); s.textContent = c + 'NW.Dom.install()';
            r = d.documentElement; r.removeChild(r.insertBefore(s, r.firstChild));
          }
        }, true);
      }

    },

  // restore Query Selector API methods (only for browsers)
  uninstall =
    function() {
      // reinstates QSA native references
      Element.prototype.closest = _closest;
      Element.prototype.matches = _matches;
      Element.prototype.querySelector =
      Document.prototype.querySelector =
      DocumentFragment.prototype.querySelector = _querySelector;
      Element.prototype.querySelectorAll =
      Document.prototype.querySelectorAll =
      DocumentFragment.prototype.querySelectorAll = _querySelectorAll;
    },

  /*-------------------------------- STORAGE ---------------------------------*/

  // empty set
  none = Array(),

  // selector
  lastMatched,
  lastSelected,

  // last context
  lastMatchContext,
  lastSelectContext,

  // cached lambdas
  matchLambdas = { },
  selectLambdas = { },

  // cached resolvers
  matchResolvers = { },
  selectResolvers = { },

  // passed to resolvers
  Snapshot = {

    doc: doc,
    from: doc,
    root: root,

    byTag: byTag,

    first: first,
    match: match,

    inherit: inherit,

    nthOfType: nthOfType,
    nthElement: nthElement,

    hasAttributeNS: hasAttributeNS,
    getAttributeNS: getAttributeNS
  },

  // public exported methods/objects
  Dom = {

    // exported cache objects

    lastMatched: lastMatched,
    lastSelected: lastSelected,

    matchLambdas: matchLambdas,
    selectLambdas: selectLambdas,

    matchResolvers: matchResolvers,
    selectResolvers: selectResolvers,

    // exported compiler macros

    CFG: CFG,

    M_BODY: M_BODY,
    S_BODY: S_BODY,
    M_TEST: M_TEST,
    S_TEST: S_TEST,

    // exported engine methods

    byId: byId,
    byTag: byTag,
    byClass: byClass,

    hasAttributeNS: hasAttributeNS,
    getAttributeNS: getAttributeNS,

    match: match,
    first: first,
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
          if (combinator.charAt(i) !== '=') {
            symbol = combinator.charAt(i);
            break;
          }
        }
        if (CFG.combinators.indexOf(symbol) < 0) {
          CFG.combinators = CFG.combinators.replace('](', symbol + '](');
          CFG.combinators = CFG.combinators.replace('])', symbol + '])');
          Combinators[combinator] = resolver;
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
          if (operator.charAt(i) !== '=') {
            symbol = operator.charAt(i);
            break;
          }
        }
        if (CFG.operators.indexOf(symbol) < 0 && !Operators[operator]) {
          CFG.operators = CFG.operators.replace(']=', symbol + ']=');
          Operators[operator] = resolver;
          setIdentifierSyntax();
        } else {
          console.warn('Warning: the \'' + operator + '\' operator is already registered.');
        }
      },

    // register a new selector symbol and its related function resolver
    registerSelector:
      function(name, rexp, func) {
        Selectors[name] || (Selectors[name] = {
          Expression: rexp,
          Callback: func
        });
      }

  };

  initialize(doc);

  return Dom;

});
