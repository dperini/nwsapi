# Nested optimizer regression

Run with Node.js ≥ 22:

```sh
pnpm install
pnpm run dev --task check:nested-selectors
```

The tests check strict factory initialization and nested selector results,
including cached queries. jsdom supplies an independent reference engine.
