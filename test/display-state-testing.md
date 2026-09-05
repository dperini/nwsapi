# Display-state regression tests

Use Node.js 18 or newer for the development test runner. Runtime compatibility is unchanged.

```sh
npm install
npm test
npx playwright install chromium
npm run test:browser
```

The Node suite pins jsdom 26.1.0 and routes its lazy selector-engine import to this checkout. It also covers alternating documents in modern and legacy mode, browser bootstrap with a delegating prototype, exceptions, nested document changes, and the legacy fallback without WeakMap. Configure legacy mode before the first query when the runtime lacks WeakMap.

The Chromium suite compares modal and popover state with the browser before opening, while open, and after closing. It exercises browser scripts, both CommonJS factory shapes, iframe documents, and installation before and after caching.

Alias tests cover document and factory prototypes. Modern mode reads no prefixed methods; legacy mode caches the selected alias or its absence.
