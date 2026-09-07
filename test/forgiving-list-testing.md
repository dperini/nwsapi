# Forgiving selector lists

Run with Node.js ≥ 22:

```sh
pnpm install
pnpm run test:node test/repo/unit/forgiving-list-items.test.mts
```

For native Chromium comparisons:

```sh
pnpm install
pnpm exec playwright install chromium
NWSAPI_BROWSER=1 pnpm run test:node test/repo/unit/forgiving-list-items.test.mts
```

The tests preserve the per-item regression from #167. They cover invalid
namespaces, unknown pseudos, nested lists, quoted and escaped commas,
top-level lists, and repeated configuration changes. An expected-failure test records the
existing hexadecimal class-escape limitation in `match()`.

The [forgiving selector-list algorithm](https://drafts.csswg.org/selectors/#forgiving-selector)
discards invalid items without discarding their valid neighbors.
