/*
 * Build the minimal upstream patches for the defects this branch fixes.
 *
 * The branch carries a toolchain, a test suite and benchmarks that upstream
 * has no use for, so a pull request cannot be the branch. Each patch here
 * touches src/nwsapi.js only, applies to upstream master on its own, and
 * carries the smallest change that fixes one reported defect.
 *
 * Every edit asserts its anchor, so a patch cannot silently apply to the
 * wrong place or to nothing. Run with the path to a checkout of upstream
 * master; each patch is written back as a file plus a message.
 *
 *   node scripts/upstream-patches.mjs <upstream-checkout> [--list]
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

function edit(source, from, to, what) {
  const count = source.split(from).length - 1;
  if (count !== 1) {
    throw new Error(`${what}: anchor matched ${count} times, expected 1`);
  }
  // A function replacement, never a string: '$&', "$'" and '$`' in a string
  // replacement are substitution patterns, and these patches carry regular
  // expressions whose text ends in $ followed by a quote.
  return source.replace(from, () => to);
}

export const PATCHES = [
  {
    kind: 'fix',
    name: 'jsdom-reentry',
    title: 'Stop state pseudo-classes from re-entering the engine',
    issues: ['172', '171', '177'],
    body: `matchesNative() reaches for node.matches at match time, on the
assumption that it is the host's own implementation. jsdom wires
Element.prototype.matches back into nwsapi, so resolving ':modal' calls
jsdom, which calls nwsapi, which resolves ':modal' again, until the stack is
exhausted — and the RangeError is then swallowed and reported as a plain
false.

Measured against 2.2.27, one NW.match(':modal', element) makes 5,428,790
re-entrant calls to Element.prototype.matches. It is 0 with this change.

Provenance is established once, when the factory runs, from
global.Element.prototype, and node.matches is never consulted. A host that
passes only a document, as jsdom does, has no native matcher and therefore no
native state to read, which is the correct outcome rather than a workaround.
A re-entrancy guard stays in place for hosts that pass their window as the
global, where the captured matcher can itself be a delegating wrapper.

This combines the two approaches already proposed in #176 and #170.`,
    apply(source) {
      source = edit(
        source,
        `  doc = global.document,
  root = doc.documentElement,
  slice = Array.prototype.slice,
`,
        `  doc = global.document,
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
`,
        'jsdom-reentry: capture',
      );

      return edit(
        source,
        `  matchesNative =
    function(node, selector) {
      var matcher = _matches || node.matches || node.webkitMatchesSelector ||
        node.mozMatchesSelector || node.msMatchesSelector;
      if (!matcher) return false;
      try {
        return matcher.call(node, selector);
      } catch (e) {
        return false;
      }
    },`,
        `  matchesNative =
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
  matchingNative = false,`,
        'jsdom-reentry: guard',
      );
    },
  },

  {
    kind: 'fix',
    name: 'forgiving-and-eof',
    title: 'Fix the forgiving fallback and EOF-terminated arguments',
    issues: [],
    body: `Two parse defects from the 2.2.25 compiler rework (7a22775).

The forgiving-selector fallback tests /(:(?:is|where)\\\\x28)/, where the
doubled escape matches a literal backslash rather than an opening
parenthesis, so an unsupported argument such as ':not(:is(svg|div))' emits
"unknown pseudo-class selector" instead of matching nothing.

The linguistic, logicalsel and treestruct groups lost their '(?:\\x29|$)'
terminator, so ':not([class]' and 'meta[charset="utf-8"' are parse errors
rather than being closed by EOF the way the CSS Syntax parser closes any open
construct. That is /css/selectors/missing-right-token.html.

Restoring the terminator alone reintroduces the bug it had been papering
over: with '[^()]*|.*' the greedy alternative swallows the closing
parenthesis of a nested argument, so ':not(:is(div))' compiles ':is(div))'.
A regular expression cannot track nesting, so the argument of :is, :where,
:matches, :not and :has is delimited by a scan for the balanced closing
parenthesis, honoring quotes and escapes, and falling back to EOF. It returns
a match-like array so the compile loop keeps popping the remainder as before.

One more change belongs with these, or the first fix trades a throw for a
wrong answer: when the validator cannot read a selector that holds a
forgiving list, parse() hands on the fragments the validator did match, each
compiled as a selector of its own, so 'div:not(:is(svg|div))' matches every
element in the document rather than the divs. It now hands on the selector,
whose forgiving argument is already evaluated inside a try/catch.`,
    apply(source) {
      source = edit(
        source,
        `    linguistic: '(dir|lang)(?:\\\\x28\\\\s?([-\\\\w]{2,})\\\\s?\\\\x29)',
    logicalsel: '(is|where|matches|not|has)(?:\\\\x28\\\\s?(' + '[^()]*|.*' + ')\\\\s?\\\\x29)',
    treestruct: '(nth(?:-last)?(?:-child|-of\\\\-type))(?:\\\\x28\\\\s?(even|odd|(?:[-+]?\\\\d*)(?:n\\\\s?[-+]?\\\\s?\\\\d*)?)\\\\s?\\\\x29)',`,
        `    linguistic: '(dir|lang)(?:\\\\x28\\\\s?([-\\\\w]{2,})\\\\s?(?:\\\\x29|$))',
    logicalsel: '(is|where|matches|not|has)(?:\\\\x28\\\\s?(' + '[^()]*|.*' + ')\\\\s?(?:\\\\x29|$))',
    treestruct: '(nth(?:-last)?(?:-child|-of\\\\-type))(?:\\\\x28\\\\s?(even|odd|(?:[-+]?\\\\d*)(?:n\\\\s?[-+]?\\\\s?\\\\d*)?)\\\\s?(?:\\\\x29|$))',`,
        'forgiving-and-eof: terminators',
      );

      const doubled = String.raw`selector.match(/(:(?:is|where)\\x28)/)`;
      const single = String.raw`selector.match(/(:(?:is|where)\x28)/)`;
      if (source.split(doubled).length - 1 !== 2) {
        throw new Error('forgiving-and-eof: expected two doubled-escape sites');
      }
      source = source.split(doubled).join(single);

      source = edit(
        source,
        `    PseudosWSP: RegExp('\\\\s+([-+])\\\\s+' + NOT.square_enc, 'g')
  },`,
        `    PseudosWSP: RegExp('\\\\s+([-+])\\\\s+' + NOT.square_enc, 'g'),
    LogicalPfx: RegExp('^:(is|where|matches|not|has)\\\\x28', 'i')
  },`,
        'forgiving-and-eof: prefix pattern',
      );

      source = edit(
        source,
        `  method = {`,
        `  // split ':is(', ':where(', ':matches(', ':not(' and ':has(' into their
  // selector list argument and the rest of the selector. The argument can
  // nest parentheses and quote them, which a single regular expression
  // cannot track, so the closing parenthesis is located by scanning. An
  // argument left unclosed is closed by EOF, as the CSS Syntax parser does
  // with any open construct. Returns a match-like array so that callers can
  // pop() the remainder the same way they do with a RegExp match.
  matchLogical =
    function(selector) {
      var chr, close, escaped, depth = 1, i, l, quote = '',
      match = selector.match(REX.LogicalPfx);

      if (!match) { return null; }

      for (i = match[0].length, l = selector.length; l > i; ++i) {
        chr = selector.charAt(i);
        if (escaped) { escaped = false; continue; }
        if (chr == '\\\\') { escaped = true; }
        else if (quote) { if (chr == quote) { quote = ''; } }
        else if (chr == '\\x22' || chr == '\\x27') { quote = chr; }
        else if (chr == '\\x28') { ++depth; }
        else if (chr == '\\x29' && --depth === 0) { break; }
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

  method = {`,
        'forgiving-and-eof: scanner',
      );

      source = edit(
        source,
        `          if (!(parsed.includes(':is(') || parsed.includes(':where('))) {
            emit('\\'' + selectors + '\\'' + qsInvalid);
            return Config.VERBOSITY ? undefined : (type ? none : false);
          }`,
        `          if (!(parsed.includes(':is(') || parsed.includes(':where('))) {
            emit('\\'' + selectors + '\\'' + qsInvalid);
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
          selectors = parsed.match(REX.SplitGroup) || [ parsed ];`,
        'forgiving-and-eof: parse fallback',
      );

      return edit(
        source,
        `            else if ((match = selector.match(Patterns.logicalsel))) {
              match[1] = match[1].toLowerCase();
              expr = match[2]
//                .replace(REX.CommaGroup, ',')
//                .replace(REX.TrimSpaces, '')
                .replace(/\\x22/g, '\\\\"');`,
        `            else if ((match = matchLogical(selector))) {
              match[1] = match[1].toLowerCase();
              expr = match[2].replace(/\\x22/g, '\\\\"');`,
        'forgiving-and-eof: use the scanner',
      );
    },
  },

  {
    kind: 'fix',
    name: 'attribute-after-pseudo',
    title: 'Let a pseudo-class be followed by a quoted attribute selector',
    issues: ['175'],
    body: `The combinator alternative inside the validator's pseudo-class
pattern is '[>+~][^>+~]', which consumes the character after the combinator.
When that character is the '[' of an attribute selector, the attribute can no
longer be parsed: the validator stops mid-selector and the whole selector is
rejected. The top-level combinator pattern already uses a lookahead, so this
makes the two agree.

"[class*='a' i]:not(:empty) + [class*='b']" is #175. It reaches jsdom users
through @testing-library/user-event, which matches every stylesheet rule when
checking pointer-events, so one such rule in a stylesheet breaks unrelated
tests.

The error it raises names '[class*='a' i]:not(:empty)+[class*,,,b,,' as the
offending selector, because emit() is passed the array of fragments the
validator did match rather than the selector; String() then joins them with
commas, which reads as corrupted quotes. It now names the selector.`,
    apply(source) {
      source = edit(
        source,
        `          '(?:' + WSP + '?[>+~][^>+~]' + WSP + '?)|' +`,
        `          // the combinator is only recognized, not consumed: taking the
          // character after it swallows the '[' of a following attribute
          // selector, which then cannot be parsed
          '(?:' + WSP + '?[>+~](?=[^>+~])' + WSP + '?)|' +`,
        'attribute-after-pseudo: lookahead',
      );

      return edit(
        source,
        `            emit('\\'' + selectors + '\\'' + qsInvalid);`,
        `            // 'selectors' holds the fragments the validator did match,
            // which read as a mangled selector once joined by String()
            emit('\\'' + parsed + '\\'' + qsInvalid);`,
        'attribute-after-pseudo: error text',
      );
    },
  },

  {
    kind: 'fix',
    name: 'link-precedence',
    title: 'Anchor the alternation in the :link and :placeholder-shown tests',
    issues: [],
    body: `/^a|area$/ alternates '^a' with 'area$' rather than anchoring an
alternation, so it accepts any element whose name begins with 'a'. ':link'
and ':any-link' therefore match <abbr href="...">, where browsers match only
<a> and <area>. It agrees with browsers on those two, which is why the test
suites do not catch it.

/^input|textarea$/ in ':placeholder-shown' has the same shape; there the
surrounding conditions happen to mask it.

The link test is hoisted into a helper at the same time, so the three places
that need it share one definition.`,
    apply(source) {
      source = edit(
        source,
        `  // check media resources is playing
  isPlaying =`,
        `  // ':link', ':any-link' and ':visited' share this test
  isLink =
    function(node) {
      return reLinkName.test(node.localName) && node.hasAttribute('href');
    },

  // check media resources is playing
  isPlaying =`,
        'link-precedence: helper',
      );

      source = edit(
        source,
        `  // emulate firefox error strings`,
        `  // elements that can carry a hyperlink, see isLink()
  reLinkName = RegExp('^(?:a|area)$', 'i'),

  // emulate firefox error strings`,
        'link-precedence: pattern',
      );

      source = edit(
        source,
        `                case 'any-link':
                  source = 'if((/^a|area$/i.test(e.localName)&&e.hasAttribute("href")||e.visited)){' + source + '}';
                  break;
                case 'link':
                  source = 'if((/^a|area$/i.test(e.localName)&&e.hasAttribute("href"))){' + source + '}';
                  break;
                case 'visited':
                  source = 'if((/^a|area$/i.test(e.localName)&&e.hasAttribute("href")&&e.visited)){' + source + '}';
                  break;`,
        `                case 'any-link':
                  source = 'if((s.isLink(e)||e.visited)){' + source + '}';
                  break;
                case 'link':
                  source = 'if(s.isLink(e)){' + source + '}';
                  break;
                case 'visited':
                  source = 'if((s.isLink(e)&&e.visited)){' + source + '}';
                  break;`,
        'link-precedence: generated code',
      );

      source = edit(
        source,
        `                      '(/^input|textarea$/i.test(e.localName))&&e.hasAttribute("placeholder")&&'`,
        `                      '(/^(?:input|textarea)$/i.test(e.localName))&&e.hasAttribute("placeholder")&&'`,
        'link-precedence: placeholder-shown',
      );

      return edit(
        source,
        `    isFocusable: isFocusable,`,
        `    isLink: isLink,
    isFocusable: isFocusable,`,
        'link-precedence: export',
      );
    },
  },
  {
    kind: 'perf',
    name: 'optimizer-nesting',
    title: 'Read the last token of a selector that ends in a nested pseudo-class',
    issues: [],
    body: `Before testing candidates, collect() asks reOptimizer for the last
simple token of a selector and uses it to fetch the candidates by tag, class
or id. The parenthesized part of that pattern is '\\x28[^\\x29]+(?:\\x29|$)',
which stops at the first ')', so a final compound holding a nested functional
pseudo-class does not match at all — and a selector the optimizer cannot read
is answered by walking every element in the context.

'div:not(:nth-of-type(2n))' therefore tests every element in the document
instead of the divs, and since ':not()' evaluates its argument through
s.match() per element, each of those elements resolves nth-of-type. On a
6300-element page that is 6344 resolutions building 3911 sibling caches over
196312 steps, for a selector whose subject is a div.

The parenthesized part now tolerates two levels of nesting, which reaches
':not(:not(:not(span)))'. Deeper than that falls back to the unoptimized scan,
as before. Both the old and new patterns stay linear on unbalanced input:
3200 unclosed parentheses match in 0.02ms.

  div:not(:nth-of-type(2n))          45.62ms -> 134.92us    338x
  div:not(:nth-child(3))              9.42ms -> 123.94us     76x
  div:is(.example):not(:where(.x))    2.65ms ->  39.45us     67x
  div:not(.x)                        27.93us ->  27.75us       -

Results are unchanged; the four above agree with the native engine.`,
    apply(source) {
      return edit(
        source,
        `      reOptimizer = RegExp(
        '(?:([.:#*]?)' +
        '(' + identifier + ')' +
        '(?:' +
          ':[-\\\\w]+|' +
          '\\\\[[^\\\\]]+(?:\\\\]|$)|' +
          '\\\\x28[^\\\\x29]+(?:\\\\x29|$)' +
        ')*)$');`,
        `      // The parenthesized part has to tolerate nesting. Written as
      // '\\x28[^\\x29]+' it stops at the first ')', so a final compound
      // holding a nested functional pseudo-class matches nothing at all, and
      // a selector the optimizer cannot read is answered by testing every
      // element in the context instead of the elements of one tag or class.
      parenthesized = '\\\\x28[^\\\\x28\\\\x29]*(?:\\\\x29|$)';
      parenthesized = '\\\\x28(?:[^\\\\x28\\\\x29]|' + parenthesized + ')*(?:\\\\x29|$)';
      parenthesized = '\\\\x28(?:[^\\\\x28\\\\x29]|' + parenthesized + ')*(?:\\\\x29|$)';

      reOptimizer = RegExp(
        '(?:([.:#*]?)' +
        '(' + identifier + ')' +
        '(?:' +
          ':[-\\\\w]+|' +
          '\\\\[[^\\\\]]+(?:\\\\]|$)|' +
          parenthesized +
        ')*)$');`,
        'optimizer-nesting: pattern',
      );
    },
  },
  {
    kind: 'perf',
    name: 'id-lookup',
    title: 'Answer an id selector from the id map instead of walking',
    issues: [],
    body: `byId() reaches for document.all and falls back to walking the
subtree element by element when it is missing. jsdom does not implement
document.all, so every '#id' takes the walk: 2.4ms on a 6300-element document
against 43ns for getElementById. jsdom is where most of nwsapi's traffic is,
so this is the common case rather than the fallback.

getElementById cannot answer on its own, since a document may carry an id
more than once and querySelectorAll matches all of them. It does settle two
things in constant time, and each buys back one case:

  - whether the id exists anywhere. If the document has none, no descendant
    of any context has one either, so select('#missing') returns immediately:
    2.19ms to 0.0007ms.
  - where the first one is, in tree order. querySelector wants exactly that,
    so a lone '#id' against a document is answered by the id map:
    first('#title') 3.74ms to 0.0007ms.

For select() against a hit the walk still runs, because the duplicates have
to be found, but it starts at the first match since none can precede it.
Element-scoped queries keep the old path, because the first document-order
match may sit outside the context and a match inside it would be missed. So
does a detached subtree, which the document's id map knows nothing about.`,
    apply(source) {
      source = edit(
        source,
        `  byIdRaw =
    function(id, context) {
      var node = context, nodes = [ ], next = node.firstElementChild;`,
        `  // Walk 'context' in tree order collecting elements carrying 'id'. The
  // walk can start at 'from', an element already known to be the first match.
  byIdRaw =
    function(id, context, from) {
      var node = context, nodes = [ ], next = from || node.firstElementChild;`,
        'id-lookup: byIdRaw start',
      );

      source = edit(
        source,
        `  byId =
    function(id, context) {
      var e, i, l, nodes, api = method['#'];`,
        `  byId =
    function(id, context) {
      var e, i, l, nodes, ownerDoc, api = method['#'];`,
        'id-lookup: byId locals',
      );

      source = edit(
        source,
        `      return byIdRaw(id, context);
    },`,
        `      // Without document.all, every '#id' used to walk the whole subtree,
      // which measures 2.4ms against 43ns for getElementById on a
      // 6300-element document. getElementById cannot answer on its own,
      // because a document may carry the same id more than once and all of
      // them match, but it does settle two things in constant time: whether
      // the id exists anywhere, and where the first one is, since it returns
      // the first in tree order and any duplicate has to follow it.
      ownerDoc = context.nodeType == 9 ? context : context.ownerDocument;

      if (ownerDoc && ownerDoc.getElementById &&
        (context.nodeType == 9 || context.isConnected)) {
        e = ownerDoc.getElementById(id);
        // nothing in the document carries the id, so nothing under context does
        if (!e) { return none; }
        // scoped to an element, the first document-order match may sit
        // outside it, and a match inside it would then be missed
        if (context.nodeType == 9) { return byIdRaw(id, context, e); }
      }

      return byIdRaw(id, context);
    },`,
        'id-lookup: byId fast paths',
      );

      source = edit(
        source,
        `  reOptimizer,`,
        `  reOptimizer,
  reSimpleId,`,
        'id-lookup: declare reSimpleId',
      );

      source = edit(
        source,
        `      reOptimizer = RegExp(`,
        `      // a lone '#id', the shape querySelector is asked for most often
      reSimpleId = RegExp('^#(' + identifier + ')$');

      reOptimizer = RegExp(`,
        'id-lookup: build reSimpleId',
      );

      return edit(
        source,
        `  first =
    function _querySelector(selectors, context, callback) {
      return select(selectors, context,`,
        `  first =
    function _querySelector(selectors, context, callback) {
      var element, match;

      // A lone '#id' against a document is the id map's own question, and the
      // first match in tree order is exactly what getElementById returns.
      // Going through select() means building the whole candidate list first,
      // and without document.all that list is built by walking the document:
      // 2.4ms against 43ns here. Duplicate ids do not change the answer, only
      // which of them comes first, and they cannot precede this one. Scoped
      // to an element the first document-order match may sit outside it, so
      // that case takes the ordinary path.
      if (selectors && context && context.nodeType == 9 &&
        context.getElementById && (match = reSimpleId.exec(selectors))) {
        element = context.getElementById(unescapeIdentifier(match[1]));
        if (element && typeof callback == 'function') { callback(element); }
        return element || null;
      }

      return select(selectors, context,`,
        'id-lookup: first() fast path',
      );
    },
  },

  {
    kind: 'perf',
    name: 'nth-constant',
    title: 'Answer a constant nth-child index without building the sibling list',
    issues: [],
    body: `':nth-child(3)' compiles to n=s.nthElement(e,false) followed by
n==3, and nthElement numbers an element by building the sibling list of its
parent. That is the right trade for an an+b form, which has to know where the
element sits, and pure overhead for a constant index, which only has to know
whether three steps back runs out of siblings. The generated code now counts
siblings and stops as soon as the index is exceeded, so it walks at most b of
them and allocates nothing.

  div:nth-child(3)         115.99us ->  46.54us   2.49x
  div:nth-last-child(3)    115.18us ->  46.08us   2.50x
  div:nth-child(7)         115.47us ->  81.02us   1.43x
  li:nth-child(2)          253.96us -> 197.74us   1.28x

Only the -child forms. Of-type has to compare the name of every sibling it
steps over, and reading localName through the host on each one costs more
than the list it avoids — measured 2.0x and 2.6x slower than the cached list
for ':nth-of-type(3)' and ':nth-last-of-type(3)' — so those keep it. The an+b
forms are untouched: ':nth-child(2n)' and ':nth-child(n+3)' still need the
index. Results agree with the native engine on every form tested.`,
    apply(source) {
      return edit(
        source,
        `                    expr = expr ? 'OfType' : 'Element';
                    type = type ? 'true' : 'false';
                    source = 'n=s.nth' + expr + '(e,' + type + ');if((' + test + ')){' + source + '}';`,
        `                    // A constant index needs no index. nth(Element|OfType)
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
                      test = type ? 'next' : 'previous';
                      source = 'n=1,o=e;' +
                        'while(n<=' + a + '&&(o=o.' + test + 'ElementSibling))++n;' +
                        'if(n==' + a + '){' + source + '}';
                      break;
                    }
                    expr = expr ? 'OfType' : 'Element';
                    type = type ? 'true' : 'false';
                    source = 'n=s.nth' + expr + '(e,' + type + ');if((' + test + ')){' + source + '}';`,
        'nth-constant: fast path',
      );
    },
  },
];

function main() {
  const argv = process.argv.slice(2);
  const flags = argv.filter(arg => arg.startsWith('--'));
  const target = argv.find(arg => !arg.startsWith('--'));
  if (flags.includes('--list') || !target) {
    for (const patch of PATCHES) {
      const refs = patch.issues.length ? ` (#${patch.issues.join(', #')})` : '';
      console.log(`${patch.kind.padEnd(5)} ${patch.name.padEnd(22)} ${patch.title}${refs}`);
    }
    if (!target) {
      console.log('\nUsage: node scripts/upstream-patches.mjs <upstream-checkout>');
    }
    return;
  }

  const file = path.join(target, 'src', 'nwsapi.js');
  const original = readFileSync(file, 'utf8');
  const out = path.join(target, '.patches');
  mkdirSync(out, { recursive: true });

  const only = flags.filter(f => f.startsWith('--only=')).map(f => f.slice(7));
  for (const patch of PATCHES) {
    if (only.length && !only.includes(patch.kind) && !only.includes(patch.name)) {
      continue;
    }
    const patched = patch.apply(original);
    if (patched === original) {
      throw new Error(`${patch.name}: produced no change`);
    }
    writeFileSync(path.join(out, `${patch.name}.js`), patched);
    const refs = patch.issues.length
      ? `\n\nCloses #${patch.issues.join('\nCloses #')}`
      : '';
    writeFileSync(
      path.join(out, `${patch.name}.msg`),
      `${patch.title}\n\n${patch.body.replace(/\n(?!\n)/g, ' ').replace(/  +/g, ' ')}${refs}\n`,
    );
    console.log(`built ${patch.name}`);
  }
}

main();
