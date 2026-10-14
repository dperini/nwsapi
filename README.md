# [NWSAPI](http://dperini.github.io/nwsapi/)

<a href="https://badge.socket.dev/npm/package/nwsapi"><img src="https://badge.socket.dev/npm/package/nwsapi" alt="Socket Badge" height="20"></a>
<picture><img src="https://raw.githubusercontent.com/dperini/nwsapi/refs/heads/prerelease/3.0.0/assets/repo/coverage.svg?v=d3f1fd881dda" height="20" alt="Coverage" /></picture>

Fast CSS selectors API engine with zero dependencies that works in Node.js and browsers.

`nwsapi` builds on [`nwmatcher`](https://github.com/dperini/nwmatcher) with [Selectors Level 4](https://drafts.csswg.org/selectors-4/) features such as `:is()`, `:where()`, and `:has()`, plus state selectors such as `:open` and `:modal`.
See the [measured selector compatibility](docs/repo/selector/compatibility.md) and [API reference](docs/repo/selector/api.md).
The [project history](docs/repo/history.md) traces the name and its NWBOX origins.

## Performance

[![nwsapi vs @asamuzakjp/dom-selector: query time, retained heap, and Brotli size on native Chromium DOMs](https://raw.githubusercontent.com/dperini/nwsapi/refs/heads/prerelease/3.0.0/assets/repo/bench/perf-hero.svg?v=9645cd2b6092)](docs/repo/perf/benchmarks.md)

<details>
<summary>How the benchmarks work</summary>

- **Speed:** 36 selectors, all matches, equal weight. Setup and loading excluded.
- **Memory:** retained heap after 100 distinct queries and garbage collection.
- **Size:** Brotli-compressed browser libraries. No `jsdom`.

[Cases, methodology, and recorded samples](docs/repo/perf/benchmarks.md).

</details>

[Performance](docs/repo/perf/benchmarks.md) · [Memory](docs/repo/perf/benchmarks.md#memory-footprint) · [File size](docs/repo/perf/benchmarks.md#file-size) · [Compliance](docs/repo/selector/compatibility.md#comparison-results) · [Inside the compiler](docs/repo/perf/design.md)

## Install

```sh
pnpm add nwsapi
```

## In `jsdom`

Plug `nwsapi` into `jsdom` for queries and stylesheet matching. Requires `nwsapi` ≥ 2.3.0 and `jsdom` 30.0.1 or a later 30.x release.
See the [public `jsdom` query comparison](docs/repo/perf/jsdom.md) against `jsdom` using `@asamuzakjp/dom-selector`.

<details>
<summary>Set up the dependency and override</summary>

Add the adapter's `css-tree` peer dependency to `package.json`:

```json
{
  "dependencies": {
    "css-tree": "^3.2.1"
  }
}
```

Replace `<version>` with the published `nwsapi` version you want to use.

- npm (`package.json`):

  ```json
  {
    "overrides": {
      "@asamuzakjp/dom-selector": "npm:nwsapi@<version>"
    }
  }
  ```

- pnpm (`pnpm-workspace.yaml`):

  ```yaml
  overrides:
    '@asamuzakjp/dom-selector': 'npm:nwsapi@<version>'
  ```

Install dependencies after the change.
The override does not change the NWSAPI factory API or add selector support.

</details>

<details>
<summary>Use the factory in Node.js</summary>

Node.js does not provide a DOM. This example creates one with `jsdom`.

```sh
pnpm add nwsapi jsdom
```

```js
const { JSDOM } = require('jsdom')
const createNwsapi = require('nwsapi')
const { window } = new JSDOM('<p class="item">Hello</p>')
const nw = createNwsapi(window)

const items = nw.select('.item', window.document)
window.close()
```

This example calls `nwsapi` directly. It does not replace `jsdom`'s selector engine.

</details>

## In browser

Load `src/nwsapi.js` from the package:

```html
<script src="nwsapi.js"></script>
<script>
  const items = NW.Dom.select('.item', document)
  const firstItem = NW.Dom.first('.item', document)
</script>
```

<details>
<summary>Replace native selector methods</summary>

`install()` changes selector methods such as `querySelectorAll()` and `matches()` for the page.
Use it only when you want those methods to call NWSAPI.

```js
NW.Dom.install()
// Restore the original methods when they are no longer needed.
NW.Dom.uninstall()
```

</details>

## API

See the [full API reference](docs/repo/selector/api.md) for all methods, options, and adapter APIs.

<!-- <onboarding> -->

## Contribute

From the checkout root:

<!-- onboarding:pnpm-install:start -->

```sh
pnpm i
pnpm run dev
```

<!-- onboarding:pnpm-install:end -->

[Make your first change](docs/repo/development/first-change.md) · [Toolchain and setup help](docs/repo/development/toolchain.md)

<details>
<summary>Use npm or repair setup</summary>

Requires Node.js 26.11.0, pnpm 12.12.0, and Git. With npm 12.2.0, use `npm i` then `npm run dev`. Repair with `npm run setup` or:

<!-- onboarding:npm-install:start -->

```sh
npm i
```

<!-- onboarding:npm-install:end -->

<!-- onboarding:bootstrap:start -->

```sh
pnpm run setup
```

<!-- onboarding:bootstrap:end -->

[Missing tools? Start here](docs/repo/development/toolchain.md).

</details>

<details>
<summary>Automate contributor tasks</summary>

Discover the ordered setup, guide, review, and diagnostics tasks:

<!-- onboarding:task-discovery:start -->

```sh
pnpm --silent run dev --list --json
```

<!-- onboarding:task-discovery:end -->

Check current checkout readiness:

<!-- onboarding:readiness:start -->

```sh
pnpm --silent run dev --task setup:check --json
```

<!-- onboarding:readiness:end -->

[Agent task contract](docs/repo/development/toolchain.md#agent-harnesses).

</details>

<!-- </onboarding> -->



<details>
<summary>Run browser tests and measure coverage</summary>

```sh
npm run test:browser # Browser regressions and media states
npm run test:wpt     # Web Platform Tests
npm run cover        # Node + WPT coverage
```

Coverage combines Node tests and WPT in Chromium. All four aggregate metrics exceed 95%.
The CLI entry point has a separate 100% coverage assertion.
The coverage command checks the minimums in `.config/coverage.config.mts` and updates the badge.
CI also creates HTML reports. Known WPT failures remain visible in test results.

[Test setup and troubleshooting →](docs/repo/testing/upstream.md) · [Benchmarks →](docs/repo/perf/benchmarks.md)

</details>

<details>
<summary>Build the package and update dependencies</summary>

Rolldown builds readable JavaScript from the `.mts` source files. The browser distribution is `dist/nwsapi.js`. The build does not minify JavaScript.
Run `npm run build` to build the files. `npm run clean` removes generated outputs and keeps dependencies and tools. Add `-- --dry-run` to preview the paths. `npm run reset:dependencies` and `npm run reset:tools` preview separate resets. Add `-- --apply` to perform a reset, then rerun `npm run setup`. Shared package stores, browser caches, and other checkouts are preserved.

Run `pnpm run package` to build and create a tarball in `dist/`.
Packaging uses an operating-system temporary directory to preserve the published `src/` paths, CommonJS API, browser and AMD support, and extension modules.
The package does not include TypeScript source files or development tools.
See the [build design](docs/repo/build/design.md) for the output layout and optional legacy hooks.

Pin development dependencies in the `pnpm-workspace.yaml` catalog. Update `pnpm-lock.yaml` when dependencies change.
Run `pnpm run update --check` to preview dependency updates.
Run `pnpm run update` to apply updates and refresh the lockfile.
Run `pnpm run soak:check` to verify the release-delay policy. `pnpm run check` includes it.
Use `pnpm run soak:bypass package@version` for an exact, dated exception.
`pnpm run update` removes expired exceptions, synchronizes the npm and pnpm settings, and retries failed taze lookups once.
Compiler tool versions need a separate compatibility review.
New dependency versions have a one-day release delay. Dependency scripts need explicit approval.
Keep root catalog declarations and npm and pnpm lockfiles synchronized when dependencies change.
Local setup and CI read exact tool versions, platform assets, and integrity hashes from `.config/external-tools.json`. See [verified tool setup](docs/repo/development/toolchain.md) for cache behavior and pin updates.
See [security tools and schemas](docs/repo/development/contributor-tools.md) and [staged v3 releases](docs/repo/development/releases.md) for the contributor checks and release commands.
The package interoperability versions are pinned in `.config/node-interop.json`. Run `pnpm run setup:node` after changing those pins.

</details>

## Donate or sponsor

Sponsorship helps fund maintenance, testing, and selector support.

<details>
<summary>Sponsorship and donation options</summary>

Use [GitHub Sponsors](https://github.com/sponsors/dperini), [Open Collective](https://opencollective.com/nwsapi), or [Patreon](https://www.patreon.com/dperini) for ongoing support.

You can also use [Ko-fi](https://ko-fi.com/dperini), [Buy Me a Coffee](https://www.buymeacoffee.com/dperini), or [Liberapay](https://liberapay.com/dperini).
Use [IssueHunt](https://issuehunt.io/r/dperini/nwsapi) to fund issues.

Corporate sponsors can ask about custom licensing, dedicated support, or priority fixes.

</details>
