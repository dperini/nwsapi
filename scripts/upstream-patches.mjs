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

// The Chromium tree is pinned, so a line number keeps meaning what it meant.
const CHROME = 'https://github.com/chromium/chromium/blob/155.0.8041.1/third_party/blink/renderer';

// Per patch: the spec that defines the behavior, the Chromium line that
// implements it, MDN where a reader wants prose, and what else the change was
// reasoned from. Rendered into each patch message by refsFor().
const REFERENCES = {
  'jsdom-reentry': [
    ['spec', 'https://drafts.csswg.org/selectors-4/#modal-state', "':modal' and the state pseudo-classes"],
    ['spec', 'https://html.spec.whatwg.org/#attr-dialog-open', "the dialog open attribute, and the 'is modal' flag that has no reflection"],
    ['chromium', 'CHROME/core/css/selector_checker.cc#L3199', "':modal' asks the element, not another selector engine"],
    ['mdn', 'https://developer.mozilla.org/en-US/docs/Web/CSS/:modal', ""],
  ],
  'forgiving-and-eof': [
    ['spec', 'https://drafts.csswg.org/selectors-4/#typedef-forgiving-selector-list', "a forgiving selector list drops the items it cannot parse"],
    ['spec', 'https://drafts.csswg.org/css-syntax/#consume-simple-block', "a construct left open at EOF is closed rather than rejected"],
    ['chromium', 'CHROME/core/css/selector_checker.cc#L2516', "':is()' and ':where()' match any item in the list"],
    ['mdn', 'https://developer.mozilla.org/en-US/docs/Web/CSS/:is', ""],
  ],
  'attribute-after-pseudo': [
    ['spec', 'https://drafts.csswg.org/selectors-4/#attribute-selectors', "attribute selectors, including the case-sensitivity flag"],
    ['spec', 'https://drafts.csswg.org/selectors-4/#attribute-case', "the 'i' flag this pattern has to survive"],
    ['mdn', 'https://developer.mozilla.org/en-US/docs/Web/CSS/Attribute_selectors', ""],
  ],
  'link-precedence': [
    ['spec', 'https://drafts.csswg.org/selectors-4/#the-any-link-pseudo', "':any-link' matches an a or area element with an href"],
    ['spec', 'https://html.spec.whatwg.org/#selector-placeholder-shown', "':placeholder-shown', for the pattern of the same shape"],
    ['chromium', 'CHROME/core/css/selector_checker.cc#L2550', "':any-link' is one IsLink() predicate"],
    ['chromium', 'CHROME/core/css/selector_checker.cc#L2553', "':link' is the same predicate, unvisited"],
    ['mdn', 'https://developer.mozilla.org/en-US/docs/Web/CSS/:any-link', ""],
  ],
  'optimizer-nesting': [
    ['spec', 'https://drafts.csswg.org/css-syntax/#consume-simple-block', "why a parenthesized part has to tolerate nesting"],
    ['spec', 'https://drafts.csswg.org/selectors-4/#matches', "the functional pseudo-classes that put parentheses inside a compound"],
  ],
  'id-lookup': [
    ['spec', 'https://dom.spec.whatwg.org/#dom-nonelementparentnode-getelementbyid', "getElementById returns the first element in tree order"],
    ['spec', 'https://dom.spec.whatwg.org/#scope-match-a-selectors-string', "what a scoped query has to match"],
    ['mdn', 'https://developer.mozilla.org/en-US/docs/Web/API/Document/getElementById', ""],
  ],
  'nth-constant': [
    ['spec', 'https://drafts.csswg.org/selectors-4/#nth-child-pseudo', "the An+B forms, of which a constant index is one"],
    ['chromium', 'CHROME/core/css/selector_checker.cc#L2443', "':nth-child' goes through a cache of sibling indexes"],
    ['chromium', 'CHROME/core/dom/nth_index_cache.h', "that cache, which is the same trade this patch avoids for a constant"],
    ['mdn', 'https://developer.mozilla.org/en-US/docs/Web/CSS/:nth-child', ""],
  ],
  'cache-two-generation': [
    ['mdn', 'https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Map', "the delete semantics this replaces"],
    ['reading', 'https://zod.dev/blog/reducing-memory-footprint', "the same measurement discipline applied to a library that caches heavily"],
  ],
  'cache-limit': [
    ['mdn', 'https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Map', ""],
    ['reading', 'https://zod.dev/blog/reducing-memory-footprint', "why a cache size is measured rather than chosen"],
  ],
  'wrapper-arguments': [
    ['mdn', 'https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Functions/arguments', "the arguments object these wrappers forward"],
  ],
  'plan-cache': [
    ['spec', 'https://dom.spec.whatwg.org/#dom-parentnode-queryselectorall', "querySelectorAll answers with a static list, so a cached answer would be wrong"],
    ['mdn', 'https://developer.mozilla.org/en-US/docs/Web/API/Document/querySelectorAll', ""],
  ],
  'ancestor-filter': [
    ['spec', 'https://drafts.csswg.org/selectors-4/#descendant-combinators', "what a descendant combinator requires of the ancestors"],
    ['chromium', 'CHROME/core/css/selector_filter.h', "the same idea in Blink: a bitset summary that only ever skips work"],
  ],
  'disabled-complement': [
    ['spec', 'https://html.spec.whatwg.org/#enabling-and-disabling-form-controls:-the-disabled-attribute', "the fieldset, legend and optgroup rules"],
    ['spec', 'https://drafts.csswg.org/selectors-4/#enableddisabled', "':enabled' and ':disabled' as complements"],
    ['chromium', 'CHROME/core/html/forms/listed_element.cc#L702', "the ancestry walk, including why it continues past a legend"],
    ['chromium', 'CHROME/core/html/forms/listed_element.cc#L738', "IsActuallyDisabled(): the own attribute or the ancestor state"],
    ['chromium', 'CHROME/core/html/forms/html_form_control_element.cc#L337', "the two pseudo-classes as one predicate"],
    ['mdn', 'https://developer.mozilla.org/en-US/docs/Web/CSS/:disabled', ""],
  ],
  'optional-anchors': [
    ['spec', 'https://html.spec.whatwg.org/#selector-optional', "the list of elements that match, which opens with button"],
    ['spec', 'https://html.spec.whatwg.org/#selector-required', "and the list for the other half"],
    ['chromium', 'CHROME/core/html/forms/html_button_element.h#L113', "a button is optional outright"],
    ['chromium', 'CHROME/core/css/selector_checker.cc#L2751', "how ':optional' is dispatched"],
    ['mdn', 'https://developer.mozilla.org/en-US/docs/Web/CSS/:optional', ""],
  ],
  'valid-fieldset': [
    ['spec', 'https://html.spec.whatwg.org/#selector-valid', "a fieldset matches when all of its controls satisfy their constraints"],
    ['chromium', 'CHROME/core/html/forms/html_field_set_element.cc#L108', "the loop that fails only on a candidate that is invalid"],
    ['chromium', 'CHROME/core/css/selector_checker.cc#L2811', "':valid' as the pair of checks"],
    ['mdn', 'https://developer.mozilla.org/en-US/docs/Web/CSS/:valid', ""],
  ],
  'property-reads': [
    ['spec', 'https://dom.spec.whatwg.org/#dom-element-classname', 'className reflects the class attribute'],
    ['spec', 'https://dom.spec.whatwg.org/#dom-element-id', 'and id reflects the id attribute'],
    ['spec', 'https://svgwg.org/svg2-draft/types.html#__svg__SVGElement__className', 'the SVG reflection that is not a string, deprecated but still shipping'],
    ['chromium', 'CHROME/core/css/selector_checker.cc#L1532', 'a class is matched against a parsed token list, not a string scan'],
    ['chromium', 'CHROME/core/css/selector_checker.cc#L1536', 'an id is compared for equality'],
    ['mdn', 'https://developer.mozilla.org/en-US/docs/Web/API/Element/className', ''],
  ],
  'defined-built-ins': [
    ['spec', 'https://dom.spec.whatwg.org/#concept-element-defined', "uncustomized and custom are the two states that count as defined"],
    ['spec', 'https://html.spec.whatwg.org/#custom-elements-core-concepts', "what makes a name a custom element name"],
    ['chromium', 'CHROME/core/dom/element.h#L1201', "the state read, with the same spec link in its own comment"],
    ['chromium', 'CHROME/core/css/selector_checker.cc#L3139', "':defined' is that and nothing else"],
    ['mdn', 'https://developer.mozilla.org/en-US/docs/Web/CSS/:defined', ""],
  ],
  'uninstall-restore': [
    ['spec', 'https://dom.spec.whatwg.org/#dom-parentnode-queryselectorall', "querySelectorAll answers a NodeList, where querySelector answers one node or null"],
    ['mdn', 'https://developer.mozilla.org/en-US/docs/Web/API/Document/querySelectorAll', ""],
  ],
  'autofill-nop': [
    ['spec', 'https://html.spec.whatwg.org/#selector-autofill', "':autofill' matches a control the user agent has autofilled"],
    ['chromium', 'CHROME/core/css/selector_checker.cc#L2778', "the state is read from the control, not inferred"],
    ['mdn', 'https://developer.mozilla.org/en-US/docs/Web/CSS/:autofill', ""],
  ],
};

function refsFor(name) {
  const refs = REFERENCES[name];
  if (!refs) {
    return '';
  }
  const label = { spec: 'Spec', chromium: 'Chromium', mdn: 'MDN', reading: 'Reading' };
  const lines = refs.map(([kind, url, note]) => {
    const link = url.startsWith('CHROME/') ? CHROME + url.slice('CHROME'.length) : url;
    return `- ${label[kind]}: ${link}${note ? ` — ${note}` : ''}`;
  });
  return `\n\nReferences:\n\n${lines.join('\n')}`;
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
re-entrant calls to Element.prototype.matches. With this change the first
query makes one call and every query after it makes none, so fifty of them
run in under a millisecond.

The matcher is taken from the node's own realm, through
ownerDocument.defaultView, and memoized per document. A matcher belonging to
another realm answers a foreign node wrong, or throws a brand check that the
existing catch turns into a silent false, and the realm this module loaded in
is not reliably the node's: the documented Node shape is
nwsapi({ document, DOMException }), which carries no Element at all.

A re-entrancy guard makes that safe. When the host matcher routes back into
this engine, the nested call returns the outer answer instead of recursing,
and the trip is recorded, so a delegating host is asked at most once per
document and never again. Under jsdom that settles to zero calls after the
first; in a browser the host keeps answering, which is where ':modal' and
':popover-open' have to come from.

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

  // A last-resort matcher, read from whatever global the factory was handed.
  // It is only reached when the node cannot produce one of its own, because
  // this global is not always the host's: the documented Node shape is
  // factory({ document, DOMException }), which carries no Element at all.
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
      var result, matcher = _matches || ownerMatcher(node);
      // Reached from inside a host matcher, so that matcher routes back into
      // this engine, which is what jsdom does. Going on would re-enter the
      // lambda that asked for the state and recurse until the stack ends.
      // The outer answer is the only one available, and the trip is recorded
      // so the host is asked at most once per document.
      if (matchingNative) { reentered = true; return false; }
      if (!matcher || (matcherDelegates && matcher === matcherFor)) { return false; }
      try {
        matchingNative = true;
        reentered = false;
        result = matcher.call(node, selector);
        if (reentered && matcher === matcherFor) { matcherDelegates = true; }
        return result;
      } catch (e) {
        return false;
      } finally {
        matchingNative = false;
      }
    },

  // set while a host matcher runs, see matchesNative
  matchingNative = false,

  // one-entry memo of the last document's matcher, since consecutive calls
  // ask about the same document
  matcherDoc = null,
  matcherFor = null,

  // set when a host matcher turned out to delegate back to this engine, so
  // it is asked once per document rather than on every call
  matcherDelegates = false,

  // set by a nested entry, which is how that delegation is noticed
  reentered = false,

  // The matcher comes from the node's own realm. A matcher belonging to some
  // other realm answers a foreign node wrong, or throws a brand check that
  // the catch above turns into a silent false, and the realm this module was
  // loaded in is not reliably the node's.
  ownerMatcher =
    function(node) {
      var view, proto, ownerDoc = node.ownerDocument;
      if (ownerDoc === matcherDoc) { return matcherFor; }
      view = ownerDoc && ownerDoc.defaultView;
      proto = view && view.Element && view.Element.prototype;
      matcherDoc = ownerDoc;
      matcherDelegates = false;
      matcherFor = (proto && (proto.matches || proto.webkitMatchesSelector ||
        proto.mozMatchesSelector || proto.msMatchesSelector)) || NATIVE_MATCHES;
      return matcherFor;
    },`,
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
        `    hasAttributeNS: hasAttributeNS`,
        `    isLink: isLink,
    hasAttributeNS: hasAttributeNS`,
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
        `      Patterns.id = RegExp(`,
        `      // a lone '#id', the shape querySelector is asked for most often
      reSimpleId = RegExp('^#(' + identifier + ')$');

      Patterns.id = RegExp(`,
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
  {
    kind: 'perf',
    name: 'cache-two-generation',
    title: 'Evict from the resolver caches without Map.delete',
    issues: [],
    body: `A strict LRU reorders on use and evicts one entry per insertion,
both with Map.delete, and V8 keeps a deleted entry in the backing store until
the map rehashes — so keys().next(), the way the oldest entry is found, walks
the tombstones every earlier eviction left. Profiling 8000 selectors cycling
through a 4096-entry cache put Map.set at 28% of total run time.

Entries are now written to a young generation. When it fills, it becomes the
old generation and the previous old one is dropped whole: no per-insertion
delete, no iteration, and eviction is a pointer swap. A hit in the old
generation carries the entry back, so anything still in use survives the next
swap. Capacity is unchanged, half the limit per generation.

get() also stops calling has() first. A cached value is never undefined, so
one lookup answers both whether the entry exists and what it holds.

Measured with both builds in one process, matching a sweep of distinct
selectors against one element:

  30 selectors, all hit      3.13us   4.68us   1.50x
  2000 selectors             732us    690us    0.94x
  3000 selectors             973us   22.72ms  23.34x
  8000 selectors            34.86ms  67.60ms   1.94x

The loss is a working set that straddles a generation: it no longer fits the
young one, so a pass takes old-generation hits and pays to carry them across.
At 3000 the comparison inverts, because a selector is not one cache entry — a
':not()' argument takes its own — so 3000 selectors overflow a 4096-entry LRU
while the segmented cache degrades instead of thrashing.`,
    apply(source) {
      const start = source.indexOf('  // ES5 bounded LRU cache.');
      if (start < 0) { throw new Error('cache-two-generation: cache comment not found'); }
      const marker = source.indexOf('size: function()', start);
      const end = source.indexOf('\n  },\n', marker);
      if (marker < 0 || end < 0) { throw new Error('cache-two-generation: cache body not found'); }

      return source.slice(0, start) + `  // Bounded cache for query plans, in two generations.
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
  createCache = function(limit) {
    var young = new Map(), old = new Map(), half;

    limit || (limit = CACHE_LIMIT);
    half = limit > 1 ? limit >> 1 : 1;

    return {
      clear: function() {
        young = new Map();
        old = new Map();
      },
      get: function(key) {
        var value = young.get(key);
        if (value !== undefined) { return value; }
        value = old.get(key);
        if (value !== undefined) {
          // second chance: carry it across before the old generation goes
          old.delete(key);
          young.set(key, value);
        }
        return value;
      },
      set: function(key, value) {
        if (young.size >= half) {
          old = young;
          young = new Map();
        }
        young.set(key, value);
        return value;
      },
      size: function() {
        return young.size + old.size;
      }
    };
  },
` + source.slice(end + 5);
    },
  },

  {
    kind: 'perf',
    name: 'cache-limit',
    title: 'Raise CACHE_LIMIT to 4096',
    issues: [],
    body: `Sweeping the limit over three workloads, with retained heap
alongside throughput, because the question is a trade rather than a maximum:

  workload                     1000      2048      4096      8192
  30 selectors, all hit     26.18us   26.93us   26.80us   27.27us
  2000 selectors            50.75ms   50.36ms    4.12ms    4.15ms
  heap, cache full           2.99mb    3.86mb    6.87mb   14.05mb

A working set that fits costs the same at any limit. One that fits 4096 and
not 1000 is worth 12x. 8192 buys nothing further and doubles the worst case,
which is only reached by a caller that has that many distinct selectors,
since the caches grow lazily.

The cliff sits between 2048 and 4096 for a set of 2000 selectors because a
selector is not one cache entry: ':not(.x)' compiles to a run-time
s.match('.x', e), so the argument takes an entry of its own. 100 such
selectors leave 200 entries in the match caches, measured.

4096 is also the value the fork of this engine inside jsdom's current
selector implementation uses.`,
    apply(source) {
      return edit(
        source,
        `  CACHE_LIMIT = 1000,`,
        `  CACHE_LIMIT = 4096,`,
        'cache-limit: constant',
      );
    },
  },

  {
    kind: 'perf',
    name: 'wrapper-arguments',
    title: 'Build the QSA wrapper argument list in one allocation',
    issues: [],
    body: `The wrappers install() puts on the DOM prototypes forward their
arguments to parseQSArgs as [].slice.call(arguments).concat(resolver), which
allocates twice for a call that carries at most three arguments. argsWith()
sizes the list by arity in a single allocation, unrolled to eight and falling
through to the general form beyond that.

Measured in isolation, building the list drops from ~113ns to ~9ns, and with
the apply included from ~119ns to ~14ns.

End to end in Chromium, three rounds with the order swapped, an installed
querySelector('#root') against a 200-element document:

  before   175ns  174ns  168ns   (wrapper 98ns, 97ns, 94ns)
  after     95ns   92ns   90ns   (wrapper 19ns, 17ns, 17ns)

That is 1.85x on a cheap query, where fixed overhead is most of the call and
the wrapper was 56% of it. On an expensive one it disappears into the query:
the same change against a 200-match 'p.x' is ~1% of 11.7us and not separable
from run-to-run noise.`,
    apply(source) {
      source = edit(
        source,
        `  install =`,
        `  // Build [ ...args, tail ] in one allocation. The QSA wrappers below hand
  // their own arguments plus a resolver to parseQSArgs; slicing and then
  // concatenating allocates twice, ~113ns per call against ~9ns sized by
  // arity. Unrolled to eight, well past the three these wrappers take,
  // because the cases cost nothing to carry and a longer call still lands on
  // the general form.
  argsWith = function(args, tail) {
    switch (args.length) {
      case 0: return [tail];
      case 1: return [args[0], tail];
      case 2: return [args[0], args[1], tail];
      case 3: return [args[0], args[1], args[2], tail];
      case 4: return [args[0], args[1], args[2], args[3], tail];
      case 5: return [args[0], args[1], args[2], args[3], args[4], tail];
      case 6: return [args[0], args[1], args[2], args[3], args[4], args[5], tail];
      case 7: return [args[0], args[1], args[2], args[3], args[4], args[5], args[6], tail];
      case 8: return [args[0], args[1], args[2], args[3], args[4], args[5], args[6], args[7], tail];
      default: return slice.call(args).concat(tail);
    }
  },

  install =`,
        'wrapper-arguments: helper',
      );

      let count = 0;
      for (const name of ['ancestor', 'match', 'first', 'select']) {
        const from = `parseQSArgs.apply(this, [].slice.call(arguments).concat(${name}))`;
        const to = `parseQSArgs.apply(this, argsWith(arguments, ${name}))`;
        count += source.split(from).length - 1;
        source = source.split(from).join(to);
      }
      if (count !== 6) {
        throw new Error(`wrapper-arguments: rewrote ${count} wrappers, expected 6`);
      }
      return source;
    },
  },
  {
    kind: 'perf',
    name: 'plan-cache',
    title: 'Cache the query plan, not the answer',
    issues: [],
    body: `select() caches the whole return of collect(), which carries
'results' — the matched elements — and 'htmlset', closures over the context.
A removed subtree therefore stays alive for as long as its selector stays in
the cache, which in a jsdom test suite is the life of the document.

Confirmed with WeakRef rather than heap arithmetic: a detached subtree
survives a forced GC after one select() and does not survive without it.
Measured with a heap benchmark, retained-after-removal falls from 11.12mb to
1.32mb.

What is cached now is the plan alone — compiled resolvers plus optimizer
tokens, all context-free — and the candidate list is rebuilt from the context
on each call. Being context-free, a plan is also reused across contexts
rather than only for the one it was built against, where before a second
context missed the cache entirely and rebuilt the plan.

'nodeset' now records the unescaped identifier the first run selects on. It
recorded the escaped form while the first run selected on the unescaped one,
so a rebuilt candidate list could ask the document for a different name.

first() also stops allocating a fresh callback closure per call for the
common no-callback case: the cached plan is only reused when the callback
matches, and a new closure never does, so every querySelector() rebuilt the
plan it had just cached. That is 1.09-1.12x on 'div.example'.`,
    apply(source) {
      source = edit(
        source,
        `        nodeset[i] = token[1] + token[2];
        token[2] = unescapeIdentifier(token[2]);
        htmlset[i] = compat[token[1]](context, token[2]);`,
        `        // unescape before recording the token: 'nodeset' is what a later
        // run rebuilds its candidate list from, so the two must agree
        token[2] = unescapeIdentifier(token[2]);
        nodeset[i] = token[1] + token[2];
        htmlset[i] = compat[token[1]](context, token[2]);`,
        'plan-cache: nodeset order',
      );

      source = edit(
        source,
        `      if (selectors) {
        if ((resolver = selectResolvers.get(selectors))) {
          if (resolver.context === context &&
            resolver.callback === callback) {
            var i, l, list,
              f = resolver.factory,
              h = resolver.htmlset,
              n = resolver.nodeset;`,
        `      if (selectors) {
        if ((resolver = selectResolvers.get(selectors))) {
          if (resolver.callback === callback) {
            var i, l, list,
              f = resolver.factory,
              n = resolver.nodeset;`,
        'plan-cache: cached path',
      );

      source = edit(
        source,
        `            } else {
              if (f[0]) {
                nodes = f[0](h[0](), callback, context, nodes);
              } else {
                nodes = h[0]();
              }
            }`,
        `            } else {
              list = compat[n[0][0]](context, n[0].slice(1))();
              nodes = f[0] ? f[0](list, callback, context, nodes) : list;
            }`,
        'plan-cache: single nodeset',
      );

      source = edit(
        source,
        `      // save/reuse factory and closure collection
      selectResolvers.set(selectors, collect(parse(selectors, true), context, callback));

      nodes = selectResolvers.get(selectors).results;`,
        `      resolver = collect(parse(selectors, true), context, callback);
      nodes = resolver.results;

      // Cache the query plan, never the answer. 'results' is a live list of
      // matched elements and 'htmlset' closes over the context, so caching
      // the whole collection kept a removed subtree alive for as long as its
      // selector stayed in the cache. What is kept here is context-free,
      // which also lets a plan be reused across contexts instead of only for
      // the one it was built against.
      selectResolvers.set(selectors, {
        callback: callback,
        factory: resolver.factory,
        nodeset: resolver.nodeset
      });`,
        'plan-cache: store the plan',
      );

      return edit(
        source,
        `  first =
    function _querySelector(selectors, context, callback) {
      return select(selectors, context,
        typeof callback == 'function' ?
        function firstMatch(element) {
          callback(element);
          return false;
        } :
        function firstMatch() {
          return false;
        }
      )[0] || null;
    },`,
        `  // A stable identity for the common no-callback case. A cached plan is
  // only reused when the callback matches, and a closure allocated per call
  // never does, so every querySelector() rebuilt the plan it had just cached.
  firstMatch =
    function firstMatch() {
      return false;
    },

  first =
    function _querySelector(selectors, context, callback) {
      return select(selectors, context,
        typeof callback == 'function' ?
        function firstMatchCallback(element) {
          callback(element);
          return false;
        } :
        firstMatch
      )[0] || null;
    },`,
        'plan-cache: stable first() callback',
      );
    },
  },
  {
    kind: 'perf',
    name: 'ancestor-filter',
    title: 'Reject candidates that cannot match before walking their ancestors',
    issues: [],
    body: `A candidate can only match 'div ul li a' if a div, a ul and a li
all appear somewhere above it, and that is far cheaper to answer than the
match itself. On the benchmark fixture it is also nearly decisive: of 2370
anchors, 10 survive the tag test and 10 match. 'dl dd a' rejects 96%,
'ul li a span' rejects all of them.

The tags above an element are summarized as bits in one integer. An element's
summary is its parent's summary plus the parent's own bit, so a chain is
walked once rather than once per candidate, and consecutive candidates —
which arrive in document order and usually share a parent — answer from a
single-entry memo without touching the Map. Bits collide, which only costs a
candidate that would have been rejected; the filter never decides a match, it
only skips work.

The required tags are collected as the selector compiles: a compound's tag is
promoted to a requirement when a descendant or child combinator puts it above
the candidate. A sibling combinator does not promote, and does not disqualify
either, since siblings share a parent and an ancestor of a sibling above that
parent is still an ancestor. The bits come from the same string the generated
comparison uses, so the filter cannot reject anything the full test would
have accepted.

  div ul li a      2.66ms -> 1.08ms   2.46x
  dl dd a          1.68ms -> 1.07ms   1.57x
  div p a          1.91ms -> 1.17ms   1.63x
  ul li a span     1.28ms -> 382us    3.35x
  ul li a          1.57ms -> 1.20ms   1.31x

Two gates keep it from costing anything where it cannot pay. It is emitted
only for a selection, since matching one element has no candidates to reject;
and only when the selector walks ancestors at all, because a chain of child
combinators takes one step per combinator whatever the depth — measured 1.47x
slower on 'div.example > p > a' before that gate went in, and unchanged after.

The summaries are dropped with the call that built them, next to where the
nth caches are reset: they key on elements, so holding them longer would keep
a removed subtree alive, and an element that moved in between would carry a
summary describing where it used to be.`,
    apply(source) {
      source = edit(
        source,
        `  // check if the document type is HTML
  isHTML =`,
        `  // A candidate can only match 'div ul li a' if a div, a ul and a li are
  // all somewhere above it. That is far cheaper to answer than the match
  // itself: the tags above an element are summarized as bits in one integer,
  // and an element's summary is its parent's summary plus the parent's own
  // bit, so the walk is paid once per chain rather than once per candidate.
  // Bits collide, which only costs a candidate that would have been
  // rejected, and the summary is a filter — a candidate that survives it is
  // still matched in full.
  ancestorMasks = new Map(),

  // candidates arrive in document order, so consecutive ones usually share a
  // parent: answering from the last one skips the Map entirely
  lastMaskNode = null,
  lastMaskValue = 0,

  tagBits = Object.create(null),

  tagBit =
    function(name) {
      var i = 0, l = name.length, h = 0, bit = tagBits[name];
      if (bit !== undefined) { return bit; }
      for (; l > i; ++i) { h = (h * 31 + name.charCodeAt(i)) | 0; }
      return (tagBits[name] = 1 << (h & 31));
    },

  ancestorMask =
    function(node) {
      var i, mask, chain = [ ], parent = node.parentElement;

      if (parent === lastMaskNode) {
        return lastMaskValue;
      }

      // walk up to the nearest ancestor already summarized, iteratively: a
      // recursive form would be bounded by the stack, not by the document
      while (parent) {
        mask = ancestorMasks.get(parent);
        if (mask !== undefined) { break; }
        chain[chain.length] = parent;
        parent = parent.parentElement;
      }

      mask = mask === undefined ? 0 : mask | tagBit(parent.localName);

      // then back down, summarizing each ancestor on the way
      for (i = chain.length - 1; i > -1; --i) {
        ancestorMasks.set(chain[i], mask);
        mask |= tagBit(chain[i].localName);
      }

      lastMaskNode = node.parentElement;
      lastMaskValue = mask;

      return mask;
    },

  clearAncestorMasks =
    function() {
      ancestorMasks.clear();
      lastMaskNode = null;
      lastMaskValue = 0;
      return true;
    },

  // check if the document type is HTML
  isHTML =`,
        'ancestor-filter: helpers',
      );

      source = edit(
        source,
        `  S_VARS = [ ],
  M_VARS = [ ],
  N_VARS = [ ],
`,
        `  S_VARS = [ ],
  M_VARS = [ ],
  N_VARS = [ ],

  // tag names a candidate must have somewhere above it, the ones still
  // waiting for a combinator that makes them an ancestor, and whether the
  // selector walks ancestors at all, see ancestorMask()
  A_REQD = [ ],
  A_PEND = [ ],
  A_WALK = false,
`,
        'ancestor-filter: collectors',
      );

      source = edit(
        source,
        `      var factory, head = '', loop = '', macro = '', source = '', vars = '';`,
        `      var factory, i, mask, head = '', loop = '', macro = '', source = '', vars = '';`,
        'ancestor-filter: compile locals',
      );

      source = edit(
        source,
        `      source = compileSelector(selector, macro, mode, callback);

      loop += mode || mode === null ? '{' + source + '}' : source;`,
        `      source = compileSelector(selector, macro, mode, callback);

      // Guard the candidate loop with the ancestor filter. Only for a
      // selection: matching one element has no candidates to reject, and the
      // walk the filter pays for would be the walk it saves. Only when the
      // selector walks ancestors: a chain of child combinators takes one step
      // per combinator whatever the depth, so there is nothing to save and
      // the lookup is a loss. Two required tags or more, so the cheap shapes
      // do not pay a Map lookup to learn what a single comparison tells them.
      if ((mode || mode === null) && A_WALK && A_REQD.length > 1) {
        for (i = 0, mask = 0; A_REQD.length > i; ++i) {
          mask |= tagBit(A_REQD[i]);
        }
        source = 'if((s.ancestorMask(e)&' + mask + ')==' + mask + '){' + source + '}';
      }

      loop += mode || mode === null ? '{' + source + '}' : source;

      // Drop the summaries with the call that built them. They key on
      // elements, so holding them past the call would keep a removed subtree
      // alive, and an element that moves in the meantime would carry a
      // summary describing where it used to be.
      if (mask) {
        loop += 's.clearAncestorMasks();';
      }`,
        'ancestor-filter: guard',
      );

      source = edit(
        source,
        `      var a, b, n, f, k = 0, compat, name,
      NS, expr, match, result, status, symbol,
      test, type, selector = expression, vars;`,
        `      var a, b, n, f, k = 0, compat, name,
      NS, expr, match, result, status, symbol,
      test, type, selector = expression, vars;

      A_REQD.length = 0;
      A_PEND.length = 0;
      A_WALK = false;`,
        'ancestor-filter: reset',
      );

      source = edit(
        source,
        `          case (/[_a-z]/i.test(symbol) ? symbol : undefined):
            match = selector.match(Patterns.tagName);
            source = 'if((e.localName=="' + match[1] + '")){' + source + '}';
            break;`,
        `          case (/[_a-z]/i.test(symbol) ? symbol : undefined):
            match = selector.match(Patterns.tagName);
            // the same string the comparison uses, so a filter built from it
            // cannot reject anything this test would have accepted
            A_PEND[A_PEND.length] = match[1];
            source = 'if((e.localName=="' + match[1] + '")){' + source + '}';
            break;`,
        'ancestor-filter: collect tags',
      );

      source = edit(
        source,
        `          case '\\x09':
          case '\\x20':
            match = selector.match(Patterns.ancestor);
            source = 'var N' + k + '=e;while(e&&(e=e.parentElement)){' + source + '}e=N' + k + ';';
            break;`,
        `          case '\\x09':
          case '\\x20':
            match = selector.match(Patterns.ancestor);
            // whatever stands to the left of this now has to appear above the
            // candidate. A sibling combinator does not promote, but it does
            // not disqualify either: siblings share a parent, so an ancestor
            // of a sibling above that parent is still an ancestor.
            A_REQD.push.apply(A_REQD, A_PEND);
            A_PEND.length = 0;
            A_WALK = true;
            source = 'var N' + k + '=e;while(e&&(e=e.parentElement)){' + source + '}e=N' + k + ';';
            break;`,
        'ancestor-filter: descendant combinator',
      );

      source = edit(
        source,
        `          case '>':
            match = selector.match(Patterns.children);
            source = 'var N' + k + '=e;if(e&&(e=e.parentElement)){' + source + '}e=N' + k + ';';`,
        `          case '>':
            match = selector.match(Patterns.children);
            A_REQD.push.apply(A_REQD, A_PEND);
            A_PEND.length = 0;
            source = 'var N' + k + '=e;if(e&&(e=e.parentElement)){' + source + '}e=N' + k + ';';`,
        'ancestor-filter: child combinator',
      );

      return edit(
        source,
        `    ancestor: ancestor,`,
        `    ancestor: ancestor,

    ancestorMask: ancestorMask,
    clearAncestorMasks: clearAncestorMasks,`,
        'ancestor-filter: export',
      );
    },
  },
  {
    kind: 'fix',
    name: 'disabled-complement',
    title: 'Make :enabled the complement of :disabled, fieldsets included',
    issues: [],
    body: `':disabled' walks the ancestry for a disabled fieldset, as the spec
requires, while ':enabled' reads only the element's own disabled property. An
input inside a disabled fieldset therefore matches both, and browsers match
neither pseudo-class twice: Blink runs them off one predicate, where
MatchesEnabledPseudoClass() is !IsDisabledFormControl().
https://github.com/chromium/chromium/blob/155.0.8041.1/third_party/blink/renderer/core/html/forms/html_form_control_element.cc#L337

The ancestry rule moves into one isDisabled() helper that both ask, which also
lets the rule follow the spec rather than approximate it. A disabled fieldset
disables its descendants unless they sit in that fieldset's first legend
child; a legend excuses only the fieldset it belongs to, so the walk carries on
outward past it; and an option is disabled by the optgroup it is a child of,
whose own disabled property reflects only that optgroup's attribute. Blink
walks it the same way, keeping a legend ancestor and comparing it against that
fieldset's own legend before continuing.
https://github.com/chromium/chromium/blob/155.0.8041.1/third_party/blink/renderer/core/html/forms/listed_element.cc#L702

':read-only' and ':read-write' read the same own-property, so a control inside
a disabled fieldset came out read-write there too; they ask the helper now.`,
    apply(source) {
      source = edit(
        source,
        `  isFocusable =`,
        `  // Whether a form control is disabled, which is not only its own
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

  isFocusable =`,
        'disabled-complement: helper',
      );

      source = edit(
        source,
        `                case 'enabled':
                  source = 'if((("form" in e||/^optgroup$/i.test(e.localName))&&"disabled" in e &&e.disabled===false' +
                    ')){' + source + '}';
                  break;`,
        `                case 'enabled':
                  // the complement of ':disabled' over the same elements
                  source = 'if((("form" in e||/^optgroup$/i.test(e.localName))&&' +
                    '"disabled" in e&&!s.isDisabled(e))){' + source + '}';
                  break;`,
        'disabled-complement: enabled',
      );

      source = edit(
        source,
        `                case 'disabled':
                  // https://html.spec.whatwg.org/#enabling-and-disabling-form-controls:-the-disabled-attribute
                  source = 'if((("form" in e||/^optgroup$/i.test(e.localName))&&"disabled" in e)){' +
                    // F is true if any of the fieldset elements in the ancestry chain has the disabled attribute specified
                    // L is true if the first legend element of the fieldset contains the element
                    'var x=0,N=[],F=false,L=false;' +
                    'if(!(/^(optgroup|option)$/i.test(e.localName))){' +
                      'n=e.parentElement;' +
                      'while(n){' +
                        'if(n.localName=="fieldset"){' +
                          'N[x++]=n;' +
                          'if(n.disabled===true){' +
                            'F=true;' +
                            'break;' +
                          '}' +
                        '}' +
                        'n=n.parentElement;' +
                      '}' +
                      'for(var x=0;x<N.length;x++){' +
                        'if((n=s.first("legend",N[x]))&&n.contains(e)){' +
                          'L=true;' +
                          'break;' +
                        '}' +
                      '}' +
                    '}' +
                    'if(e.disabled===true||(F&&!L)){' + source + '}}';
                  break;`,
        `                case 'disabled':
                  source = 'if((("form" in e||/^optgroup$/i.test(e.localName))&&' +
                    '"disabled" in e&&s.isDisabled(e))){' + source + '}';
                  break;`,
        'disabled-complement: disabled',
      );

      source = edit(
        source,
        `                      '(/^textarea$/i.test(e.localName)&&(e.readOnly||e.disabled))||' +`,
        `                      '(/^textarea$/i.test(e.localName)&&(e.readOnly||s.isDisabled(e)))||' +`,
        'disabled-complement: read-only textarea',
      );

      source = edit(
        source,
        `?(e.readOnly||e.disabled):true))||' +`,
        `?(e.readOnly||s.isDisabled(e)):true))||' +`,
        'disabled-complement: read-only input',
      );

      source = edit(
        source,
        `                      '(/^textarea$/i.test(e.localName)&&!e.readOnly&&!e.disabled)||' +`,
        `                      '(/^textarea$/i.test(e.localName)&&!e.readOnly&&!s.isDisabled(e))||' +`,
        'disabled-complement: read-write textarea',
      );

      source = edit(
        source,
        `.includes("|"+e.type+"|")&&!e.readOnly&&!e.disabled)||' +`,
        `.includes("|"+e.type+"|")&&!e.readOnly&&!s.isDisabled(e))||' +`,
        'disabled-complement: read-write input',
      );

      return edit(
        source,
        `    isModal: isModal,`,
        `    isDisabled: isDisabled,
    isModal: isModal,`,
        'disabled-complement: export',
      );
    },
  },
  {
    kind: 'fix',
    name: 'optional-anchors',
    title: 'Anchor the :required and :optional tests, and let :optional take a button',
    issues: [],
    body: `/^input|select|textarea$/ alternates '^input' with 'select' and with
'textarea$' rather than anchoring an alternation, so it accepts any element
whose name begins with 'input', any name containing 'select', and any ending
in 'textarea'. Both pseudo-classes use it.

':optional' also has to match button elements, which the HTML spec lists first
among the ones it matches and which Blink answers true for outright.
https://github.com/chromium/chromium/blob/155.0.8041.1/third_party/blink/renderer/core/html/forms/html_button_element.h#L113

A button has no required property, so '!e.required' is true for one and the
list is the only change needed.`,
    apply(source) {
      source = edit(
        source,
        `                    'if((/^input|select|textarea$/i.test(e.localName)&&e.required)' +`,
        `                    'if((/^(?:input|select|textarea)$/i.test(e.localName)&&e.required)' +`,
        'optional-anchors: required',
      );

      return edit(
        source,
        `                    'if((/^input|select|textarea$/i.test(e.localName)&&!e.required)' +`,
        `                    'if((/^(?:button|input|select|textarea)$/i.test(e.localName)&&!e.required)' +`,
        'optional-anchors: optional',
      );
    },
  },
  {
    kind: 'fix',
    name: 'valid-fieldset',
    title: 'A fieldset is :valid when none of its controls is invalid',
    issues: [],
    body: `':valid' asks whether a fieldset contains a ':valid' descendant. The
rule is that none of its controls may be invalid, which is a different thing: a
fieldset holding no validation candidates at all is valid, and was matching
neither ':valid' nor ':invalid'. A fieldset inside a disabled fieldset is the
common case, since every control under it is barred from validation.

Blink answers true for a fieldset's validity pseudo-classes and then loops its
controls, failing only on one that is a candidate and invalid.
https://github.com/chromium/chromium/blob/155.0.8041.1/third_party/blink/renderer/core/html/forms/html_field_set_element.cc#L108`,
    apply(source) {
      return edit(
        source,
        `                      '(/^fieldset$/i.test(e.localName)&&s.first(":valid",e))' +`,
        `                      '(/^fieldset$/i.test(e.localName)&&!s.first(":invalid",e))' +`,
        'valid-fieldset: emission',
      );
    },
  },
  {
    kind: 'fix',
    name: 'defined-built-ins',
    title: 'Every built-in element is :defined',
    issues: [],
    body: `':defined' asks the custom element registry about the candidate's tag
name and requires an instanceof match, so it matches upgraded custom elements
and nothing else. Every built-in element is defined; only a custom element can
be undefined, and only until a definition exists and it has been upgraded.
Browsers read it off the element's custom element state, where uncustomized and
custom are the two that count as defined.
https://github.com/chromium/chromium/blob/155.0.8041.1/third_party/blink/renderer/core/dom/element.h#L1201

The test reads the hyphen in the name first, which is what makes a name a
custom element name, and asks for the 'is' attribute only when there is none,
so an ordinary element costs one string scan.`,
    apply(source) {
      source = edit(
        source,
        `  isContentEditable =`,
        `  // Whether an element is defined, which every built-in element is. Only
  // a custom element can be undefined: one whose name carries a hyphen, or a
  // built-in carrying an 'is' attribute, and in both cases only until a
  // definition exists and the element has been upgraded to it.
  // https://dom.spec.whatwg.org/#concept-element-defined
  isDefined =
    function(element) {
      var custom, name = element.localName, registry, view;

      if (name.indexOf('-') < 0) {
        if (!element.hasAttribute('is')) { return true; }
        name = element.getAttribute('is') || name;
      }

      view = doc.defaultView;
      registry = view && view.customElements;
      if (!registry || !registry.get) { return false; }
      custom = registry.get(name);
      return !!custom && element instanceof custom;
    },

  isContentEditable =`,
        'defined-built-ins: helper',
      );

      source = edit(
        source,
        `                case 'defined':
                  source = 'n=s.doc.defaultView.customElements.get(e.localName);if(n&&e instanceof n){' + source + '}';
                  break;`,
        `                case 'defined':
                  source = 'if(s.isDefined(e)){' + source + '}';
                  break;`,
        'defined-built-ins: emission',
      );

      return edit(
        source,
        `    isOpen: isOpen,`,
        `    isDefined: isDefined,
    isOpen: isOpen,`,
        'defined-built-ins: export',
      );
    },
  },
  {
    kind: 'perf',
    name: 'property-reads',
    title: 'Read the class and the id as properties, and compare the id',
    issues: [],
    body: `Two of the tests the resolvers run per candidate ask the host for an
attribute where the same value is reflected as a property, and one of them
matches a pattern where the selector means an exact comparison.

A class test calls getAttribute('class'). The class attribute is reflected as
Element.className, and reading a property is cheaper than calling through the
host: 0.477ms against 0.851ms over 6344 elements in jsdom. The reflection is a
string on an HTML element and an SVGAnimatedString on an SVG one, which SVG 1.1
defined and SVG 2 deprecated without removing, so classOf() checks the type and
asks for the attribute when it is not a string. Reading it without that check
matches the class against '[object SVGAnimatedString]' and quietly finds
nothing.

An id test compiles to a regular expression over getAttribute('id'), where the
selector asks whether the id equals one string. Comparing e.id measures 0.383ms
against 0.717ms on the same document. The escapes have to survive the change,
since a comparison holds a string where the pattern held a pattern, so the
value goes through escapeIdentifier the way an attribute value already does.

Browsers do both: Blink matches a class against a parsed token list and
compares an id for equality rather than matching it.`,
    apply(source) {
      source = edit(
        source,
        `  // context agnostic getElementsByClassName
  byClass =`,
        `  // The class of an element, for the one element kind whose reflection is
  // not a string. SVG 1.1 defined SVGElement.className as an
  // SVGAnimatedString, SVG 2 deprecated it, and the browsers still ship it,
  // so the type is checked and the attribute asked for when it is not a
  // string. baseVal carries the markup, which is cheaper than asking again.
  classOf =
    function(e) {
      var value = e.className;
      if (typeof value == 'string') { return value; }
      if (value && typeof value.baseVal == 'string') { return value.baseVal; }
      return e.getAttribute('class');
    },

  // context agnostic getElementsByClassName
  byClass =`,
        'property-reads: classOf',
      );

      source = edit(
        source,
        `            compat = (QUIRKS_MODE ? 'i' : '') + '.test(e.getAttribute("class"))';`,
        `            compat = (QUIRKS_MODE ? 'i' : '') + '.test(s.classOf(e))';`,
        'property-reads: class test',
      );

      source = edit(
        source,
        `            source = 'if((/^' + match[1] + '$/.test(e.getAttribute("id")))){' + source + '}';`,
        `            // an exact comparison, which is what the selector asks for.
            // escapeIdentifier turns the CSS escapes into JavaScript ones, so
            // only the quote is escaped after it.
            expr = escapeIdentifier(match[1]).replace(/\\x22/g, '\\\\"');
            source = 'if((e.id=="' + expr + '")){' + source + '}';`,
        'property-reads: id test',
      );

      return edit(
        source,
        `    isPictureInPicture: isPictureInPicture,`,
        `    classOf: classOf,
    isPictureInPicture: isPictureInPicture,`,
        'property-reads: export',
      );
    },
  },

  {
    kind: 'fix',
    name: 'uninstall-restore',
    title: 'Restore querySelectorAll from the method that was saved for it',
    issues: [],
    body: `uninstall() restores Element.prototype.querySelectorAll and
HTMLElement.prototype.querySelectorAll from _querySelector, the single-result
method, rather than from _querySelectorAll, which install() saved for exactly
this. After one install() and uninstall() cycle a host is left with
querySelectorAll answering one element instead of a list.

_querySelectorAll is already captured beside the others in install() and is
otherwise unused on the element prototypes, so this is the assignment it was
saved for.`,
    apply(source) {
      return edit(
        source,
        `        Element.prototype.querySelectorAll =
        HTMLElement.prototype.querySelectorAll = _querySelector;`,
        `        Element.prototype.querySelectorAll =
        HTMLElement.prototype.querySelectorAll = _querySelectorAll;`,
        'uninstall-restore: querySelectorAll',
      );
    },
  },

  {
    kind: 'fix',
    name: 'autofill-nop',
    title: 'Stop :autofill matching every element',
    issues: [],
    body: `':autofill' and ':-webkit-autofill' are handled by the pseudo_nop
group, which breaks out of the compile loop without emitting a test. A
resolver with no test accepts whatever it is given, so ':autofill' matches
every element in the document and 'input:autofill' matches every input.

Emitting a test that never passes keeps the selector valid, which is what the
group is for, and answers it the way a host with no autofill state should:
matching nothing. That is also what the reference engine answers.

The case that reads the host, further down the same switch, is unreachable
today because this group claims the selector first. Routing there would be
the browser-accurate answer, and it belongs with the re-entrancy fix in #178,
since the call it makes is the one that recurses under a host whose matcher
routes back into this engine.`,
    apply(source) {
      return edit(
        source,
        `            else if ((match = selector.match(Patterns.pseudo_nop))) {
              break;
            }`,
        `            else if ((match = selector.match(Patterns.pseudo_nop))) {
              // Valid to write, and never a match: the state behind these is
              // the host's to report, and a resolver that emits no test at
              // all accepts every element instead of none.
              source = 'if(false){' + source + '}';
              selector = match[1];
              break;
            }`,
        'autofill-nop: emit a failing test',
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
      console.log('');
      console.log('Usage: node scripts/upstream-patches.mjs <upstream-checkout>');
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
      `${patch.title}\n\n${patch.body.replace(/\n(?!\n)/g, ' ').replace(/  +/g, ' ')}${refsFor(patch.name)}${refs}\n`,
    );
    console.log(`built ${patch.name}`);
  }
}

main();
