# Attribute equality regression

Run with Node.js 26:

```sh
pnpm install
pnpm run test:unit
pnpm exec playwright install chromium
pnpm run test:browser
```

The Node tests check case rules, escaped values, missing attributes, XML,
SVG, cached queries, and a custom operator. Chromium independently checks
HTML attribute case rules; jsdom's selector engine is not the oracle.

Case-sensitive equality uses a string comparison. Case-insensitive matches
and other operators retain their existing regular-expression path.
