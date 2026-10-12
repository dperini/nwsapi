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
    "@asamuzakjp/dom-selector": "npm:nwsapi@<version>"
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
const { JSDOM } = require("jsdom");
const createNwsapi = require("nwsapi");
const { window } = new JSDOM('<p class="item">Hello</p>');
const nw = createNwsapi(window);

const items = nw.select(".item", window.document);
window.close();
```

This example calls `nwsapi` directly. It does not replace `jsdom`'s selector engine.

</details>

## In browser

Load `src/nwsapi.js` from the package:

```html
<script src="nwsapi.js"></script>
<script>
  const items = NW.Dom.select(".item", document);
  const firstItem = NW.Dom.first(".item", document);
</script>
```

<details>
<summary>Replace native selector methods</summary>

`install()` changes selector methods such as `querySelectorAll()` and `matches()` for the page.
Use it only when you want those methods to call NWSAPI.

```js
NW.Dom.install();
// Restore the original methods when they are no longer needed.
NW.Dom.uninstall();
```

</details>

## API

See the [full API reference](docs/repo/selector/api.md) for all methods, options, and adapter APIs.

## Contribute

Start with [Make your first change](docs/repo/development/first-change.md). It explains each step, the expected result, and how to continue after an interruption.

Use Node.js 22.18 or newer, Git, archive extraction tools, and network access. From the checkout root, bootstrap tools, install dependencies, and build the package. Start with this direct Node command because the pinned package manager may not be installed yet:

<!-- onboarding:bootstrap:start -->

```sh
node scripts/repo/setup/bootstrap.mts
```

<!-- onboarding:bootstrap:end -->

For a direct package-manager install, use the pinned contributor Node version (26.11.0) and the matching manager version from the root manifest. The package managers are pinned to npm 12.2.0 and pnpm 12.12.0. `npm i` and `pnpm i` each run the checkout's install lifecycle, which prepares its local tools and build. The root pins and catalogs are kept in sync with both lockfiles.

To discover the ordered setup, guide, review, and diagnostics tasks from a terminal or an agent:

<!-- onboarding:task-discovery:start -->

```sh
node scripts/repo/develop/run.mts --list --json
```

<!-- onboarding:task-discovery:end -->

After setup, check the current checkout readiness:

<!-- onboarding:readiness:start -->

```sh
node scripts/repo/develop/run.mts --task setup:check --json
```

<!-- onboarding:readiness:end -->

Follow [Make your first change](docs/repo/development/first-change.md) for the edit, review, commit, and push sequence. It includes optional focused tests and shows which checks apply to specific changes.

For documentation changes, use `.cache/bin/pnpm run guide` to open the local documentation with live updates. For setup problems, use `.cache/bin/pnpm run setup:check` to report readiness and the next action. Add `-- --details` to inspect paths, version requirements, and wrappers.

After setup, run `node scripts/repo/develop/run.mts` for a guided menu to open documentation, review changes, or troubleshoot setup. Use 1–4 or the arrow keys to preview a task, then Enter to run its displayed command. Use `node scripts/repo/develop/run.mts --plain` for numbered prompts.

Setup keeps tools in this checkout and preserves shell defaults. It reuses valid downloads when rerun. Browser tests, WPT, and security checks prepare their additional tools when requested. Full repository checks also prepare WPT. See [toolchain details](docs/repo/development/toolchain.md) for pins and advanced setup.

<details>
<summary>Package manager details</summary>

`npm i` and `pnpm i` both use this branch's matching root pins, lockfiles, and lifecycle. Use the direct Node bootstrap above when the pinned package manager is not installed. After setup, prefer `node scripts/repo/develop/run.mts --task <id> --json` for repository tasks, or `.cache/bin/pnpm` when you need package-manager commands. No PATH edits are needed.

The equivalent direct install commands are:

<!-- onboarding:npm-install:start -->

```sh
npm i
```

<!-- onboarding:npm-install:end -->

<!-- onboarding:pnpm-install:start -->

```sh
pnpm i
```

<!-- onboarding:pnpm-install:end -->

</details>

<details>
<summary>Check changes before a push</summary>

```sh
pnpm run check
pnpm run test:package
pnpm run test:fuzz        # Bounded coverage-guided pass
pnpm run test:fuzz:replay # Replay saved inputs and crashes
```

These are additional checks for changes that need them. Run `pnpm run fix` to apply lint fixes, format files, and check the result. Run `pnpm run test:watch` to repeat Node tests while you edit files.

Run `pnpm run ci:local` to test the GitHub Actions workflow locally.
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
