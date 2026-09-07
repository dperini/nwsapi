# Relative selectors

Run with Node.js ≥ 22:

```sh
pnpm install
pnpm run test:node test/repo/e2e/relative-has.test.mts test/repo/unit/has-anchor-isolation.test.mts
```

For native Chromium comparisons:

```sh
pnpm install
pnpm exec playwright install chromium
NWSAPI_BROWSER=1 pnpm run test:node test/repo/e2e/relative-has.test.mts
```

The 23 browser selectors run against document, element, and detached contexts.
They cover sibling and descendant anchors, selector lists, explicit `:scope`,
and the nested logical-selector regression from #167. Node checks also verify
anchor restoration after exceptions and successful queries.

Two expected-failure tests record inherited acceptance of nested `:has()` and
pseudo-elements. Anchors are emitted as code, not private selector syntax.
Tests reject the former private pseudo in public and nested queries, including
cached queries, and preserve quoted attribute values. See the
[relational pseudo-class requirements](https://drafts.csswg.org/selectors/#relational).

This change builds on the sibling root guards and selector-list parser already
on master.
