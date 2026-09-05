# Relative selectors

Run with Node.js ≥ 22:

```sh
npm install --no-save --package-lock=false jsdom@26.1.0
node --test test/relative-has.test.cjs
```

For native Chromium comparisons:

```sh
npm install --no-save --package-lock=false jsdom@26.1.0 @playwright/test@1.62.1
npx playwright install chromium
NWSAPI_BROWSER=1 node --test test/relative-has.test.cjs
```

The 23 browser selectors run against document, element, and detached contexts.
They cover sibling and descendant anchors, selector lists, explicit `:scope`,
and the nested logical-selector regression from #167. Node checks also verify
anchor restoration after exceptions and successful queries.

This extraction remains a draft. Two TODO tests record inherited acceptance
of nested `:has()` and pseudo-elements. The internal anchor pseudo also needs
isolation from public selector syntax before merge. See the
[relational pseudo-class requirements](https://drafts.csswg.org/selectors/#relational).

The sibling root guards overlap with #169, but already exist in this branch's
master base. This proposal changes anchoring and list evaluation, not just
those guards. Its `splitList` helper is shared with #199; merging either
proposal first will require retaining only one identical helper declaration.
