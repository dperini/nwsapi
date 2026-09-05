# Attribute parse errors

Run with Node.js ≥ 22:

```sh
npm install --ignore-scripts --package-lock=false
npm run test:attributes
```

The suite checks LF, CR, and CRLF inside single- and double-quoted
attribute values. Selection, first-match lookup, and direct attribute
matching must report `SyntaxError`, not leak a `TypeError`. Quiet mode
must return no match. Repeated calls check that caches do not change errors.

Valid cases cover missing closing tokens, selector whitespace, and a hex
escape. End of input can close a construct; a newline inside a quoted
string is not end of input.

Four TODO tests record valid escaped line continuations that the existing
tokenizer does not support. The null-match guard does not fix tokenization.
Other existing gaps include unescaped form feed in strings and truncation
of a tag-prefixed selector at a newline in `match()`. These need separate
parser work; this suite exercises the failing attribute-compiler path.

See [CSS string tokenization](https://drafts.csswg.org/css-syntax/#consume-string-token)
and [function consumption](https://drafts.csswg.org/css-syntax/#consume-function).
