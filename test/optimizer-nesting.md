# Nested optimizer regression

Run with Node.js ≥ 22:

```sh
npm install
npm run test:optimizer
```

The tests check strict factory initialization and nested selector results,
including cached queries. jsdom supplies an independent reference engine.
