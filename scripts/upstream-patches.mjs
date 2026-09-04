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
];

function main() {
  const [target, ...flags] = process.argv.slice(2);
  if (flags.includes('--list') || !target) {
    for (const patch of PATCHES) {
      const refs = patch.issues.length ? ` (#${patch.issues.join(', #')})` : '';
      console.log(`${patch.name.padEnd(22)} ${patch.title}${refs}`);
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

  for (const patch of PATCHES) {
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
