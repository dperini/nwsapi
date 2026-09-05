# Forgiving selector lists

Run with Node.js ≥ 22:

```sh
npm install --no-save --package-lock=false jsdom@26.1.0
node --test test/forgiving-list-items.test.cjs
```

For native Chromium comparisons:

```sh
npm install --no-save --package-lock=false jsdom@26.1.0 @playwright/test@1.62.1
npx playwright install chromium
NWSAPI_BROWSER=1 node --test test/forgiving-list-items.test.cjs
```

The tests preserve the per-item regression from #167. They cover invalid
namespaces, unknown pseudos, nested lists, quoted and escaped commas,
top-level lists, and repeated configuration changes. A TODO records the
existing hexadecimal class-escape limitation in `match()`.

The [forgiving selector-list algorithm](https://drafts.csswg.org/selectors/#forgiving-selector)
discards invalid items without discarding their valid neighbors.
