# Relative selectors

Run with Node.js ≥ 22:

```sh
pnpm install
pnpm run test:node test/relative-has.test.mts
```

For native Chromium comparisons:

```sh
pnpm install
pnpm exec playwright install chromium
NWSAPI_BROWSER=1 pnpm run test:node test/relative-has.test.mts
```

The 23 browser selectors run against document, element, and detached contexts.
They cover sibling and descendant anchors, selector lists, explicit `:scope`,
and the nested logical-selector regression from #167. Node checks also verify
anchor restoration after exceptions and successful queries.

This extraction still needs review. Two expected-failure tests record inherited acceptance
of nested `:has()` and pseudo-elements. The internal anchor pseudo also needs
isolation from public selector syntax before merge. See the
[relational pseudo-class requirements](https://drafts.csswg.org/selectors/#relational).

The sibling root guards overlap with #169, but already exist in this branch's
master base. This proposal changes anchoring and list evaluation, not just
those guards. Its `splitList` helper is shared with #199; merging either
proposal first will require retaining only one identical helper declaration.
