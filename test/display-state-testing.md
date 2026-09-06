# Display-state regression tests

Use Node.js ≥ 22 for the development test runner. Runtime compatibility is unchanged.

```sh
pnpm install
pnpm test
pnpm exec playwright install chromium
pnpm run test:browser
```

The Node suite uses jsdom 30.0.1 and routes its selector-engine import through this checkout's adapter. It also covers alternating documents in modern and legacy mode, browser bootstrap with a delegating prototype, exceptions, nested document changes, and the legacy fallback without WeakMap. Configure legacy mode before the first query when the runtime lacks WeakMap.

The Chromium suite compares modal and popover state with the browser before opening, while open, and after closing. It exercises browser scripts, both CommonJS factory shapes, iframe documents, and installation before and after caching.

Alias tests cover document and factory prototypes. Modern mode reads no prefixed methods; legacy mode caches the selected alias or its absence.

Matcher replacements clear the cached delegation result. Changing `LEGACY` clears mode-dependent records for every document. The WPT runner also executes the local `matcher-cache.html` regressions through the upstream test harness; they contribute browser engine coverage without changing the upstream checkout.
