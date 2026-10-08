# [NWSAPI](http://dperini.github.io/nwsapi/)

<a href="https://badge.socket.dev/npm/package/nwsapi"><img src="https://badge.socket.dev/npm/package/nwsapi" alt="Socket Badge" height="20"></a>
<picture><img src="https://raw.githubusercontent.com/dperini/nwsapi/refs/heads/prerelease/3.0.0/assets/repo/coverage.svg?v=d3f1fd881dda" height="20" alt="Coverage" /></picture>

Fast CSS selectors API engine with zero dependencies that works in Node.js and browsers.

`nwsapi` builds on [`nwmatcher`](https://github.com/dperini/nwmatcher) with [Selectors Level 4](https://drafts.csswg.org/selectors-4/) features such as `:is()`, `:where()`, and `:has()`, plus state selectors such as `:open` and `:modal`.
See the [measured selector compatibility](docs/repo/selector/compatibility.md) and [API reference](docs/repo/selector/api.md).
The [project history](docs/repo/history.md) traces the name and its NWBOX origins.

## Performance

[![NWSAPI > Fast CSS Selectors API Engine](https://raw.githubusercontent.com/dperini/nwsapi/refs/heads/prerelease/3.0.0/assets/repo/bench/perf-hero.svg?v=9645cd2b6092)](docs/repo/perf/benchmarks.md)

This summary compares the standalone browser libraries across query time, retained JavaScript heap, and compressed file size.

<details>
<summary>How the benchmarks work</summary>

The timing comparison runs [36 different CSS selectors](docs/repo/perf/benchmarks.md#all-results-comparison) repeatedly. Each call returns every matching element, rather than stopping at the first match. The selectors cover component markup, documentation pages, and utility classes. The summary gives each selector equal weight.

This summary also covers retained heap after 100 distinct queries per engine and compressed browser file sizes. The measurements compare `nwsapi` with `@asamuzakjp/dom-selector` on native Chromium DOMs and exclude `jsdom`.

Query timings exclude document creation, library loading, and engine construction. Memory measurements record retained JavaScript heap after garbage collection. Documents and shared library code exist before the baseline reading. File sizes compare the browser libraries after Brotli compression. The [benchmark report](docs/repo/perf/benchmarks.md) explains each workload and links to its recorded samples.

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

## Contribute

Use Node.js 22.18 or newer to bootstrap the pinned contributor toolchain.

```sh
npm run setup
npm test
```

`npm run setup` and `pnpm run setup` select this branch's pinned `pnpm` automatically. Setup downloads and verifies `mise`, `nub`, `npm`, and `pnpm`, uses `mise` with `nub` to provision Node, installs dependencies, and sets up WPT and Chromium. Versions and integrity hashes live in `.config/external-tools.json`. Tools stay in the checkout's ignored `.cache/` directory. Setup needs Git, archive extraction tools, and network access.

Tests, builds, and checks started with another package manager automatically use the local `pnpm` runtime. For dependency installation, use `npm run setup` rather than `npm install`, which cannot read this branch's workspace catalog. To use the pinned tools directly, run `export PATH="$PWD/.cache/bin:$PATH"` in a POSIX shell or `$env:PATH = "$PWD\.cache\bin;$env:PATH"` in PowerShell.
Node tests do not use the browser or WPT checkout.

Run `npm run guide` to open the interactive model guide and its Markdown reader
with live updates. See the [guide instructions](docs/repo/perf/pytorch-for-beginners.md)
for the local URL and static build command.

<details>
<summary>Check changes before a push</summary>

```sh
npm run check
npm run test:package
npm run test:fuzz        # Bounded coverage-guided pass
npm run test:fuzz:replay # Replay saved inputs and crashes
```

Run `npm run fix` to apply lint fixes, format files, and check the result.
Run `npm run test:watch` to repeat Node tests while you edit files.

Run `npm run ci:local` to test the GitHub Actions workflow locally.
It needs Docker and GitHub CLI authentication. It pauses when a step fails.
The gates workflow uses one Node.js 26 job. Its package lane checks CommonJS, ESM, the CLI, and the `jsdom` consumer path on Node.js 22, 24, and 26 provisioned by `nub`.

</details>

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
Run `npm run build` to build the files. Run `npm run clean` to remove build outputs, dependencies, and local tool/test/browser caches; it also prunes unreferenced packages from the pnpm store. Re-run `npm run setup` to restore the checkout.

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
Use pnpm to install this repository. npm cannot install its catalog references.
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
