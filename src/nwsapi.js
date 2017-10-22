/*
 * Copyright (C) 2007-2017 Diego Perini
 * All rights reserved.
 *
 * nwsapi.js - Fast CSS Selectors API Engine
 *
 * Author: Diego Perini <diego.perini at gmail com>
 * Version: 2.0.0
 * Created: 20070722
 * Release: 20171022
 *
 * License:
 *  http://javascript.nwbox.com/nwsapi/MIT-LICENSE
 * Download:
 *  http://javascript.nwbox.com/nwsapi/nwsapi.js
 */

(function(global, factory) {

  'use strict';

  if (typeof module == 'object' && typeof exports == 'object') {
    module.exports = factory;
  } else if (typeof define === 'function' && define["amd"]) {
    define(factory);
  } else {
    global.NW || (global.NW = { });
    global.NW.Dom = factory(global);
  }

})(this, function(global) {

  var version = 'nwsapi-2.0.0',

  doc = global.document,
  nav = global.navigator,
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
    skip_groups: '\\[.*\\]|\\(.*\\)|\\{.*\\}',
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
    SplitComma: RegExp('\\s*,\\s*'),
    TokensSymb: RegExp('\\#|\\.|\\*'),
    EscOrQuote: RegExp('^\\\\|[\\x22\\x27]'),
    RegExpChar: RegExp('(?:(?!\\\\)[\\\\^$.*+?()[\\]{}|\\/])' ,'g'),
    TrimSpaces: RegExp('[\\n\\r\\f]|^' + WSP + '+|' + WSP + '+$', 'g'),
    FixEscapes: RegExp('\\\\(' + HEX + '{1,6}' + WSP + '?|.)|([\\x22\\x27])', 'g'),
    SplitGroup: RegExp(WSP + '*,' + WSP + '*(?![^\\[]*\\]|[^\\(]*\\)|[^\\{]*\\})', 'g')
  },

  reOptimizer,
  reSimpleNot,
  reSimpleMul,
  reSimpleUni,
  reValidator,

  struct_1 = '(?:root|empty|scope)|(?:(?:first|last|only)(?:-child|-of-type))',
  struct_2 = '(?:nth(?:-last)?(?:-child|-of-type))',
  pseudo_1 = 'any-link|link|visited|target|active|focus|hover',
  pseudo_2 = 'checked|disabled|enabled|selected|local-link(?:\\(\\d*\\))?|lang\\(([-\\w]{2,})\\)',
  pseudo_3 = 'default|indeterminate|optional|required|valid|invalid|in-range|out-of-range|read-only|read-write',
  pseudo_4 = 'after|before|first-letter|first-line',
  pseudo_5 = 'selection|backdrop|placeholder',
  params_1 = '(?:\\(\\s*(even|odd|(?:[-+]{0,1}\\s*\\d*\\s*)*n?(?:[-+]{0,1}\\s*\\d*\\s*))\\s*\\))',
  negation = '|(?:matches|not)\\(\\s*(:' + struct_2 + params_1 + '|[^()]*)\\s*\\)',

  Patterns = {
    struct_n: RegExp('^:(' + struct_1 + ')?(.*)', 'i'),
    struct_p: RegExp('^:(' + struct_2 + params_1 + ')?(.*)', 'i'),
    spseudos: RegExp('^:(' + struct_1 + '|' + struct_2 + params_1 + ')?(.*)', 'i'),
    dpseudos: RegExp('^:(' + pseudo_1 + '|' + pseudo_2 + negation + ')?(.*)', 'i'),
    epseudos: RegExp('^:(:?(?:' + pseudo_4 + ')|:(?:' + pseudo_5 + '))?(.*)', 'i'),
    hpseudos: RegExp('^:(' + pseudo_3 + ')?(.*)', 'i'),
    children: RegExp('^' + WSP + '*\\>' + WSP + '*(.*)'),
    adjacent: RegExp('^' + WSP + '*\\+' + WSP + '*(.*)'),
    relative: RegExp('^' + WSP + '*\\~' + WSP + '*(.*)'),
    ancestor: RegExp('^' + WSP + '+(.*)'),
   universal: RegExp('^\\*(.*)'),
   namespace: RegExp('^(\\w+|\\*)?\\|(.*)')
  },

  reNthElem = RegExp('(:nth(?:-last)?-child)', 'i'),
  reNthType = RegExp('(:nth(?:-last)?-of-type)', 'i'),

  QUIRKS_MODE,
  HTML_DOCUMENT,

  ATTR_ID = 'e.id',

  ATTR_STD_OPS = {
    '=': 1, '^=': 1, '$=': 1, '|=': 1, '*=': 1, '~=': 1
  },

  FIX_ID = '(typeof(e.id)=="string"?e.id:e.getAttribute("id"))',

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
/*
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
*/
  Operators = {
     '=': "n=='%m'",
    '^=': "n.indexOf('%m')==0",
    '*=': "n.indexOf('%m')>-1",
    '|=': "(n+'-').indexOf('%m-')==0",
    '~=': "(' '+n+' ').indexOf(' %m ')>-1",
    '$=': "n.substr(n.length-'%m'.length)=='%m'"
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
        root = doc.documentElement;
        HTML_DOCUMENT = isHTML(doc);
        QUIRKS_MODE = HTML_DOCUMENT &&
          doc.compatMode.indexOf('CSS') < 0;
        ATTR_ID = Config.BUGFIX_ID ? FIX_ID : 'e.id';
        Snapshot.doc = doc;
        Snapshot.root = root;
      }
      return (Snapshot.from = context);
    },

  codePointToUTF16 =
    function(codePoint) {
      if (codePoint < 1 || codePoint > 0x10ffff ||
        (codePoint > 0xd7ff && codePoint < 0xe000)) {
        return '\\ufffd';
      }
      if (codePoint < 0x10000) {
        var lowHex = '000' + codePoint.toString(16);
        return '\\u' + lowHex.substr(lowHex.length - 4);
      }
      return '\\u' + (((codePoint - 0x10000) >> 0x0a) + 0xd800).toString(16) +
             '\\u' + (((codePoint - 0x10000) % 0x400) + 0xdc00).toString(16);
    },

  stringFromCodePoint =
    function(codePoint) {
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

  convertEscapes =
    function(str) {
      return REX.HasEscapes.test(str) ?
        str.replace(REX.FixEscapes,
          function(substring, p1, p2) {
            return p2 ? '\\' + p2 :
              REX.HexNumbers.test(p1) ? codePointToUTF16(parseInt(p1, 16)) :
              REX.EscOrQuote.test(p1) ? substring :
              p1;
          }
        ) : str;
    },

  unescapeIdentifier =
    function(str) {
      return REX.HasEscapes.test(str) ?
        str.replace(REX.FixEscapes,
          function(substring, p1, p2) {
            return p2 ? p2 :
              REX.HexNumbers.test(p1) ? stringFromCodePoint(parseInt(p1, 16)) :
              REX.EscOrQuote.test(p1) ? substring :
              p1;
          }
        ) : str;
    },

  method = {
    '#': 'getElementById',
    '*': 'getElementsByTagName',
    '.': 'getElementsByClassName'
    },

  compat = {
    '#': function(c, n, z) { return function(e, f) { return byId(n, c); }; },
    '*': function(c, n, z) { return function(e, f) { return byTag(n, c); }; },
    '.': function(c, n, z) { return function(e, f) { return byClass(n, c); }; }
    },

  domapi = {
    '#': function(c, n, z) { return function(e, f) { if (e && z) return z; z = c.getElementById(n); return z = z ? [ z ] : none; };},
    '*': function(c, n, z) { return function(e, f) { if (e && z) return z; z = c.getElementsByTagName(n); return f ? concatCall(z, f) : toArray(z); };},
    '.': function(c, n, z) { return function(e, f) { if (e && z) return z; z = c.getElementsByClassName(n); return f ? concatCall(z, f) : toArray(z); };}
    },

  hasDuplicateId =
    function(id, context) {
      var i = 0, cloned, element, fragment;

      cloned = context.firstElementChild.cloneNode(true);
      fragment = doc.createDocumentFragment();
      fragment.appendChild(cloned);

      while ((element = fragment.getElementById(id))) {
        element.parentNode.removeChild(element); ++i;
        if (i > 1) { break; }
      }

      return i > 1;
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
  idTest = 't==' + FIX_ID,
  tagMatch = 't.test(e.nodeName)', tagTest = 'a||(e.nodeName==t)',

  byId =
    function(id, context) {
      var element, elements, resolver;

      id = unescapeIdentifier(id);
      id = id.replace(/\x00|\\$/g, '\ufffd');

      if (!(Config.DUPLICATE && hasDuplicateId(id, context))) {
        if ('getElementById' in context) {
          return (element = context.getElementById(id)) ? [ element ] : none;
        }
      }

      context.nodeType != 1 && (context = context.firstElementChild);
      resolver = Function('t', walk.replace('@', idTest))(id);
      elements = resolver(context);

      return Config.DUPLICATE ? elements : elements[0] || null;
    },

  byTag =
    function(tag, context) {
      var i = 0, any = tag == '*', element = context,
      elements = Array(), next = element.firstElementChild;
      tag = HTML_DOCUMENT ? tag.toUpperCase() : tag;
      while ((element = next)) {
        if (any || element.nodeName == tag) {
          elements[i] = element; ++i;
        }
        if ((next = element.firstElementChild || element.nextElementSibling)) continue;
        while (!next && (element = element.parentNode) && element !== context) {
          next = element.nextElementSibling;
        }
      }
      return elements;
    },

  byClass =
    function(cls, context) {
      return byTag('*', context);
    },

  nthElement =
    function(element, last) {
      var count = 1, succ;
      if (last == 2) return -1;
      succ = last ?
        'nextElementSibling' :
        'previousElementSibling';
      while ((element = element[succ])) {
        ++count;
      }
      return count;
    },

  nthOfType =
    function(element, last) {
      var count = 1, succ, type;
      if (last == 2) return -1;
      type = element.nodeName;
      succ = last ?
        'nextElementSibling' :
        'previousElementSibling';
      while ((element = element[succ])) {
        if (element.nodeName == type) ++count;
      }
      return count;
    },

  isHTML =
    function(node) {
      var doc = node.ownerDocument || node, root = doc.documentElement;
      return doc.nodeType == 9 && ('body' in doc) && root.nodeName == 'HTML' &&
        doc.createElement('DiV').nodeName != 'DiV' && !(doc instanceof XMLDocument);
    },

  configure =
    function(option) {
      if (typeof option == 'string') { return !!Config[option]; }
      if (typeof option != 'object') { return Config; }
      for (var i in option) {
        Config[i] = !!option[i];
        if (i == 'SIMPLENOT') {
          matchResolvers = { };
          selectResolvers = { };
        }
      }
      setIdentifierSyntax();
      return true;
    },

  emit =
    function(message) {
      if (Config.VERBOSITY) { throw Error(message); }
      if (Config.LOGERRORS && console && console.log) {
        console.log(message);
      }
    },

  Config = {

    ESCAPECHR: true,
    NON_ASCII: true,
    SELECTOR3: true,
    UNICODE16: true,

    BUGFIX_ID: true,
    DUPLICATE: true,

    SIMPLENOT: true,
    SVG_LCASE: false,
    USE_HTML5: true,

    LOGERRORS: true,
    VERBOSITY: true
  },

  initialize =
    function(doc) {
      setIdentifierSyntax();
      lastMatchContext = doc;
      lastSelectContext = doc;
      switchContext(doc, true);
    },

  setIdentifierSyntax =
    function() {

      var identifer,
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
          WSP + '*' +
          '(' + identifier + '(?::' + identifier + ')?)' +
          WSP + '*' +
          '(?:' +
            '(' + CFG.operators + ')' + WSP + '*' +
            '(?:' + attrparser + ')' +
          ')?' +
          // attribute case sensitivity
          WSP + '*' + '(i)?' + WSP + '*' +
        '\\]';

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
        '(?=[\\x20\\t\\n\\r\\f]*[^>+~(){}<>])' +
        '(?:' +
          // universal * &
          // namespace *|*
          '(?:\\*|\\|)|' +
          '(?:[.#]?' + identifier + ')+|' +
          '(?:' + attributes + ')+|' +
          '(?:::?' + identifier + pseudoclass + ')|' +
          '(?:' + WSP + '*' + CFG.combinators + WSP + '*)|' +
          '(?:' + WSP + '*,' + WSP + '*)' +
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

      reSimpleUni = RegExp('^([.#]?)(-?(?:-{2}|[_a-zA-Z]|[^\x00-\x9f])(?:-|[0-9]|[_a-zA-Z]|[^\x00-\x9f])*)$');
      reSimpleMul = RegExp('^(\\.?)(-?(?:-{2}|[_a-zA-Z]|[^\x00-\x9f])(?:-|[0-9]|[_a-zA-Z]|[^\x00-\x9f])*)$');

      Patterns.id = RegExp('^#(' + identifier + ')(.*)');
      Patterns.tagName = RegExp('^(' + identifier + ')(.*)');
      Patterns.className = RegExp('^\\.(' + identifier + ')(.*)');
      Patterns.attribute = RegExp('^(?:' + attrmatcher + ')(.*)');

      extendedValidator = standardValidator.replace(pseudoclass, '.*');

      reValidator = RegExp(Config.SIMPLENOT ?
        standardValidator : extendedValidator, 'g');
    },

  F_INIT = '"use strict";return function Resolver(c,f)',

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

  compile =
    function(groups, mode, callback) {

      var i, l, key, factory, selector, token, vars, res = '',
      head = '', loop = '', macro = '', source = '', seen = { };

      if (typeof groups == 'string') groups = [groups];

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

  compileSelector =
    function(selector, source, mode, callback) {

      var a, b, n, k = 0, expr, match, result, status, test, type, vars;

      while (selector) {

        k++;

        if ((match = selector.match(Patterns.universal))) {
          expr = '';
        }

        else if ((match = selector.match(Patterns.id))) {
          match[1] = (/\\/).test(match[1]) ? convertEscapes(match[1]) : match[1];
          source = 'if(' + (!HTML_DOCUMENT ?
            'e.getAttribute("id")' :
            '(e.submit?e.getAttribute("id"):e.id)') +
            '=="' + match[1] + '"' +
            '){' + source + '}';
        }

        else if ((match = selector.match(Patterns.tagName))) {
          test = Config.SVG_LCASE ? '||e.nodeName=="' + match[1].toLowerCase() + '"' : '';
          source = 'if(e.nodeName' + (!HTML_DOCUMENT ?
            '=="' + match[1] + '"' : '.toUpperCase()' +
            '=="' + match[1].toUpperCase() + '"' + test) +
            '){' + source + '}';
        }

        else if ((match = selector.match(Patterns.className))) {
          match[1] = (/\\/).test(match[1]) ? convertEscapes(match[1]) : match[1];
          match[1] = QUIRKS_MODE ? match[1].toLowerCase() : match[1];
          source = 'if((n=' + (!HTML_DOCUMENT ?
            'e.getAttribute("class")' : 'e.className') +
            ')&&n.length&&(" "+' + (QUIRKS_MODE ? 'n.toLowerCase()' : 'n') +
            '.replace(/' + WSP + '+/g," ")+" ").indexOf(" ' + match[1] + ' ")>-1' +
            '){' + source + '}';
        }

        else if ((match = selector.match(Patterns.attribute))) {
          expr = match[1].split(':');
          expr = expr.length == 2 ? expr[1] : expr[0] + '';
          if (match[2] && !Operators[match[2]]) {
            emit('Unsupported operator in attribute selectors "' + selector + '"');
            return '';
          }
          test = 'false';
          if (match[2] && match[4] && (test = Operators[match[2]])) {
            match[4] = (/\\/).test(match[4]) ? convertEscapes(match[4]) : match[4];
            type = match[5] == 'i' || HTML_TABLE[expr.toLowerCase()];
            test = test.replace(/\%m/g, type ? match[4].toLowerCase() : match[4]);
          } else if (match[2] == '!=' || match[2] == '=') {
            test = 'n' + match[2] + '=""';
          }
          source = 'if(n=e.hasAttribute("' + match[1] + '")){' +
            (match[2] ? 'n=e.getAttribute("' + match[1] + '")' : '') +
            (type && match[2] ? '.toLowerCase();' : ';') +
            'if(' + (match[2] ? test : 'n') + '){' + source + '}}';
        }

        else if ((match = selector.match(Patterns.adjacent))) {
          source = 'var N' + k + '=e;while(e&&(e=e.previousSibling)){if(e.nodeName>"@"){' + source + 'break;}}e=N' + k + ';';
        }

        else if ((match = selector.match(Patterns.relative))) {
          source = 'var N' + k + '=e;e=e.parentNode.firstChild;while(e&&e!==N' + k + '){if(e.nodeName>"@"){' + source + '}e=e.nextSibling;}e=N' + k + ';';
        }

        else if ((match = selector.match(Patterns.children))) {
          source = 'var N' + k + '=e;while(e&&e!==s.root&&e!==s.from&&(e=e.parentNode)){' + source + 'break;}e=N' + k + ';';
        }

        else if ((match = selector.match(Patterns.ancestor))) {
          source = 'var N' + k + '=e;while(e&&e!==s.root&&e!==s.from&&(e=e.parentNode)){' + source + '}e=N' + k + ';';
        }

        else if ((match = selector.match(Patterns.spseudos)) && match[1]) {
          switch (match[1]) {
            case 'root':
              if (match[3]) {
                source = 'if(e===s.root||s.root.contains(e)){' + source + '}';
              } else {
                source = 'if(e===s.root){' + source + '}';
              }
              break;
            case 'empty':
              source = 'n=e.firstChild;while(n&&!(/1|3/).test(n.nodeType)){n=n.nextSibling}if(!n){' + source + '}';
              break;
            default:
              if (match[1] && match[2]) {
                if (match[2] == 'n') {
                  source = 'if(e!==s.root){' + source + '}';
                  break;
                } else if (match[2] == 'even') {
                  a = 2;
                  b = 0;
                } else if (match[2] == 'odd') {
                  a = 2;
                  b = 1;
                } else {
                  b = ((n = match[2].match(/(-?\d+)$/)) ? parseInt(n[1], 10) : 0);
                  a = ((n = match[2].match(/(-?\d*)n/i)) ? parseInt(n[1], 10) : 0);
                  if (n && n[1] == '-') a = -1;
                }
                test = a > 1 ?
                  (/last/i.test(match[1])) ? '(n-(' + b + '))%' + a + '==0' :
                  'n>=' + b + '&&(n-(' + b + '))%' + a + '==0' : a < -1 ?
                  (/last/i.test(match[1])) ? '(n-(' + b + '))%' + a + '==0' :
                  'n<=' + b + '&&(n-(' + b + '))%' + a + '==0' : a === 0 ?
                  'n==' + b : a == -1 ? 'n<=' + b : 'n>=' + b;
                source =
                  'if(e!==s.root){' +
                    'n=s[' + (/-of-type/i.test(match[1]) ? '"nthOfType"' : '"nthElement"') + ']' +
                      '(e,' + (/last/i.test(match[1]) ? 'true' : 'false') + ');' +
                    'if(' + test + '){' + source + '}' +
                  '}';
              } else {
                a = /first/i.test(match[1]) ? 'previous' : 'next';
                n = /only/i.test(match[1]) ? 'previous' : 'next';
                b = /first|last/i.test(match[1]);
                type = /-of-type/i.test(match[1]) ? '&&n.nodeName!=e.nodeName' : '&&n.nodeName<"@"';
                source = 'if(e!==s.root){' +
                  ( 'n=e;while((n=n.' + a + 'Sibling)' + type + ');if(!n){' + (b ? source :
                    'n=e;while((n=n.' + n + 'Sibling)' + type + ');if(!n){' + source + '}') + '}' ) + '}';
              }
              break;
          }
        }

        else if ((match = selector.match(Patterns.dpseudos)) && match[1]) {
          switch (match[1].match(/^\w+/)[0]) {
            case 'matches':
              expr = match[3].replace(REX.TrimSpaces, '');
              source = 'if(s.match("' + expr.replace(/\x22/g, '\\"') + '",e,s.from)){' + source +'}';
              break;
            case 'not':
              expr = match[3].replace(REX.TrimSpaces, '');
              if (Config.SIMPLENOT && !reSimpleNot.test(expr)) {
                emit('Negation pseudo-class only accepts simple selectors "' + selector + '"');
                return '';
              } else {
                source = 'if(!s.match("' + expr.replace(/\x22/g, '\\"') + '",e)){' + source +'}';
              }
              break;
            case 'checked':
              source = 'if((typeof e.form!=="undefined"&&(/^(?:radio|checkbox)$/i).test(e.type)&&e.checked)' +
                (Config.USE_HTML5 ? '||(/^option$/i.test(e.nodeName)&&(e.selected||e.checked))' : '') +
                '){' + source + '}';
              break;
            case 'disabled':
              source = 'if(((typeof e.form!=="undefined"' +
                (Config.USE_HTML5 ? '' : '&&!(/^hidden$/i).test(e.type)') +
                ')||/a|area|link/i.test(e.nodeName))&&e.disabled===true){' + source + '}';
              break;
            case 'enabled':
              source = 'if(((typeof e.form!=="undefined"' +
                (Config.USE_HTML5 ? '' : '&&!(/^hidden$/i).test(e.type)') +
                ')||/a|area|link/i.test(e.nodeName))&&e.disabled===false){' + source + '}';
              break;
            case 'lang':
              test = '';
              if (match[2]) test = match[2].substr(0, 2) + '-';
              source = 'do{(n=e.lang||"").toLowerCase();' +
                'if((n==""&&s.root.lang=="' + match[2].toLowerCase() + '")||' +
                '(n&&(n=="' + match[2].toLowerCase() +
                '"||n.substr(0,3)=="' + test.toLowerCase() + '")))' +
                '{' + source + 'break;}}while((e=e.parentNode)&&e!==s.from);';
              break;
            case 'target':
              source = 'if(e.id==s.doc.location.hash.slice(1)){' + source + '}';
              break;
            case 'link':
              source = 'if((/a|area|link/i.test(e.nodeName)&&e.hasAttribute("href"))){' + source + '}';
              break;
            case 'visited':
              source = 'if((/a|area|link/i.test(e.nodeName)&&e.hasAttribute("href")&&e.visited)){' + source + '}';
              break;
            case 'active':
              source = 'if(e===s.doc.activeElement){' + source + '}';
              break;
            case 'hover':
              source = 'if(e===s.doc.hoverElement){' + source + '}';
              break;
            case 'focus':
              source = 'hasFocus' in doc ?
                'if(e===s.doc.activeElement&&s.doc.hasFocus()&&(e.type||e.href||typeof e.tabIndex=="number")){' + source + '}' :
                'if(e===s.doc.activeElement&&(e.type||e.href)){' + source + '}';
              break;
            case 'selected':
              source = 'if(/^option$/i.test(e.nodeName)&&(e.selected||e.checked)){' + source + '}';
              break;
            default:
              break;
          }
        }

        else if ((match = selector.match(Patterns.hpseudos)) && match[1]) {
          switch (match[1].match(/^[-\w]+/)[0]) {
            case 'default':
              source = 'if(typeof e.form!=="undefined"&&(e===s.first("[type=submit]",e.form))||' +
                '((/^(radio|checkbox)$/i.test(e.type)||/^option$/i.test(e.nodeName))&&' +
                '(e.defaultChecked||e.defaultSelected))){' + source + '}';
              break;
            case 'indeterminate':
              source = 'if(typeof e.form!=="undefined"&&(/^progress$/i.test(e.type)&&!e.value)||' +
                '(/^radio$/i.test(e.type)&&!s.first("[name="+e.name+"]:checked",e.form))||' +
                '(/^checkbox$/i.test(e.type)&&e.indeterminate)){' + source + '}';
              break;
            case 'optional':
              source = 'if(typeof e.form!=="undefined"&&e.required===false){' + source + '}';
              break;
            case 'required':
              source = 'if(typeof e.form!=="undefined"&&e.required===true){' + source + '}';
              break;
            case 'read-write':
              source = 'if(typeof e.form!=="undefined"&&e.readOnly===false){' + source + '}';
              break;
            case 'read-only':
              source = 'if(typeof e.form!=="undefined"&&e.readOnly===true){' + source + '}';
              break;
            case 'invalid':
              source = 'if(((/^form$/i.test(e.nodeName)&&!e.noValidate)||' +
                '(e.willValidate&&!e.formNoValidate))&&!e.checkValidity()){' + source + '}';
              break;
            case 'valid':
              source = 'if(((/^form$/i.test(e.nodeName)&&!e.noValidate)||' +
                '(e.willValidate&&!e.formNoValidate))&&e.checkValidity()){' + source + '}';
              break;
            case 'in-range':
              source = 'if(typeof e.form!=="undefined"&&' +
                '(e.getAttribute("min")||e.getAttribute("max"))&&' +
                '!(e.validity.rangeUnderflow||e.validity.rangeOverflow)){' + source + '}';
              break;
            case 'out-of-range':
              source = 'if(typeof e.form!=="undefined"&&' +
                '(e.getAttribute("min")||e.getAttribute("max"))&&' +
                '(e.validity.rangeUnderflow||e.validity.rangeOverflow)){' + source + '}';
              break;
            default:
              break;
          }
        }

        else if ((match = selector.match(Patterns.epseudos)) && match[1]) {
          source = 'if(!(/1|11/).test(e.nodeType)){' + source + '}';
        }

        else {

          expr = false;
          status = false;
          for (expr in Selectors) {
            if ((match = selector.match(Selectors[expr].Expression)) && match[1]) {
              result = Selectors[expr].Callback(match, source, mode, callback);
              if ('match' in result) { match = result.match; }
              vars = result.modvar;
              if (mode) {
                 vars && S_VARS.indexOf(vars) < 0 && (S_VARS[S_VARS.length] = vars);
              } else {
                 vars && M_VARS.indexOf(vars) < 0 && (M_VARS[M_VARS.length] = vars);
              }
              source = result.source;
              status = result.status;
              if (status) { break; }
            }
          }

          if (!status) {
            emit('Unknown pseudo-class selector "' + selector + '"');
            return '';
          }

          if (!expr) {
            emit('Unknown token in selector "' + selector + '"');
            return '';
          }

        }

        if (!match) {
          emit('Invalid syntax in selector "' + selector + '"');
          return '';
        }

        selector = match && match[match.length - 1];
      }

      return source;
    },

  optimize =
    function(expression, token) {
      var index = token.index,
      length = token[1].length + token[2].length;
      return expression.slice(0, index) +
        (' >+~'.indexOf(expression.charAt(index - 1)) > -1 ?
          (':['.indexOf(expression.charAt(index + length + 1)) > -1 ?
          '*' : '') : '') + expression.slice(index + length);
    },

  parseGroup =
    function(selector) {
      var i, l,
      groups = selector.
        replace(/,\s*,/g, ',').
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
      if (typeof selector != 'string') {
        selector = '' + selector;
      }

      // normalize selector
      expression = selector.
        replace(/\x00|\\$/g, '\ufffd').
        replace(REX.TrimSpaces, '').
        replace(/\x20+/g, ' ');

      // parse and validate expression and split possible selector groups
      if ((groups = expression.match(reValidator)) && groups.join('') == expression) {
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
        typeof callback == 'function' ?
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
          return resolver.factory(resolver.builder, callback);
        }
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
      if (typeof selector != 'string') {
        selector = '' + selector;
      }

      // normalize selector
      expression = selector.
        replace(/\x00|\\$/g, '\ufffd').
        replace(REX.TrimSpaces, '').
        replace(/\x20+/g, ' ');

      // parse and validate expression and split possible selector groups
      if ((groups = expression.match(reValidator)) && groups.join('') == expression) {
        groups = /\,/.test(expression) ? parseGroup(expression) : [expression];
        if (groups.indexOf('') > -1) {
          emit('invalid or illegal string specified');
          return Config.VERBOSITY ? undefined : none;
        }
      } else {
        emit('\'' + selector + '\' is not a valid selector');
        return Config.VERBOSITY ? undefined : none;
      }

      resolver = collect(
        groups.length < 2 ? expression : groups, context, callback,
        HTML_DOCUMENT && context.nodeType != 11 ? domapi : compat);

      if (!selectResolvers[selector] && !callback) {
        selectResolvers[selector] = {
          builder: resolver.builder,
          factory: resolver.factory,
          context: context
        };
      }

      return resolver.factory(resolver.builder, callback);
    },

  collect =
    function(expression, context, callback, resolvers) {
      var builder, factory, ident, symbol, token;
      if (typeof expression == 'string') {
        if ((token = expression.match(reOptimizer)) && (ident = token[2])) {
          symbol = token[1] || '*';
          ident = unescapeIdentifier(ident);
          if (!(symbol == '#' && context.nodeType == 1)) {
            if ('.#*'.indexOf(symbol) > -1) {
              builder = resolvers[symbol](context, ident);
              if (HTML_DOCUMENT && context.nodeType != 11) {
                expression = optimize(expression, token);
              }
            }
          }
        }
      }
      return {
        builder: builder || resolvers['*'](context, '*'),
        factory: factory || compile(expression, true, callback)
      };
    },

  /*-------------------------------- STORAGE ---------------------------------*/

  // empty set
  none = Array(),

  // selector
  lastMatched,
  lastSelected,

  // context
  lastMatchContext,
  lastSelectContext,

  matchLambdas = { },
  selectLambdas = { },

  matchResolvers = { },
  selectResolvers = { },

  Snapshot = {

    doc: doc,
    from: doc,
    root: root,

    byTag: byTag,

    first: first,
    match: match,

    nthOfType: nthOfType,
    nthElement: nthElement

  },

  Dom = {

    lastMatched: lastMatched,
    lastSelected: lastSelected,

    matchLambdas: matchLambdas,
    selectLambdas: selectLambdas,

    matchResolvers: matchResolvers,
    selectResolvers: selectResolvers,

    CFG: CFG,

    M_BODY: M_BODY,
    S_BODY: S_BODY,
    M_TEST: M_TEST,
    S_TEST: S_TEST,

    byId: byId,
    byTag: byTag,
    byClass: byClass,

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

    Operators: Operators,
    Selectors: Selectors,

    registerCombinator:
      function(combinator, resolver) {
        var i = 0, l = combinator.length, symbol;
        for (; l > i; ++i) {
          if (combinator.charAt(i) != '=') {
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

    registerOperator:
      function(operator, resolver) {
        var i = 0, l = operator.length, symbol;
        for (; l > i; ++i) {
          if (operator.charAt(i) != '=') {
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
