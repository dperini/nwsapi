# Attribute parse errors

Run with Node.js ≥ 22:

```sh
pnpm install
pnpm run test:attributes
pnpm exec playwright install chromium
pnpm run test:attributes:browser
```

The suite checks LF, CR, CRLF, and form feed inside single- and double-quoted
attribute values. Selection, first-match lookup, and direct attribute
matching must report `SyntaxError`, not leak a `TypeError`. Quiet mode
must return no match. Repeated calls check that caches do not change errors.

Valid cases cover missing closing tokens, selector whitespace, and a hex
escape. End of input can close a construct; a newline inside a quoted
string is not end of input.

Escaped line continuations are consumed before whitespace normalization.
Hex escapes keep their boundaries when a continuation is removed. Coverage
includes literal backslashes, escaped quotes, attribute operators, repeated
continuations and end-of-input recovery. Raw newlines remain invalid even
at the end of input, and `match()` checks the whole tag-prefixed selector.

All attribute tests are required to pass. The browser command compares
selection, first-match lookup and matching against Chromium, twice per
selector to exercise cached calls. It requires no WPT checkout or server.

Validation: 163 attribute tests, four runtime tests and 11 adapter tests pass
with jsdom 30.0.1. All 155 browser cases agree with Chromium 151.0.7922.34. The
41-page WPT runner from #167 also passes with its baseline unchanged.

See [CSS string tokenization](https://drafts.csswg.org/css-syntax/#consume-string-token)
and [function consumption](https://drafts.csswg.org/css-syntax/#consume-function).
