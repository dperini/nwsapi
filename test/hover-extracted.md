# Regression tests

Install hover tracking only when a hover selector is used.

Run with Node.js ≥ 22, using a jsdom-supported release: 22.22.2+, 24.15.0+, or 26+.

```sh
pnpm install
pnpm run test:extracted
```

Extracted from #167. Assertions cover both results and the optimized route.
These tests do not establish an end-to-end speedup.

Modern hosts retain hover state weakly per document. Legacy hosts without
WeakMap retain only the current document's state. Stable listener callbacks
prevent duplicate registration when those hosts revisit a document.
