# Regression tests

Route simple descendant chains through scoped lookups when their estimated cost is lower.

Run with Node.js 26.

```sh
pnpm install
pnpm run test:unit
```

Extracted from #167. Assertions cover both results and the optimized route.
These tests do not establish an end-to-end speedup.
