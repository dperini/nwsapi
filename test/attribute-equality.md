# Attribute equality regression

Run with Node.js ≥ 22:

```sh
pnpm install
pnpm run test:attributes
pnpm exec playwright install chromium
NWSAPI_BROWSER=1 pnpm run test:attributes
```

The Node tests check case rules, escaped values, missing attributes, XML,
SVG, cached queries, and a custom operator. Chromium independently checks
HTML attribute case rules; jsdom's selector engine is not the oracle.

Case-sensitive equality uses a string comparison. Case-insensitive matches
and other operators retain their existing regular-expression path.
