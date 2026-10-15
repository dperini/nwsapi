# [NWSAPI](http://dperini.github.io/nwsapi/)

<a href="https://badge.socket.dev/npm/package/nwsapi"><img src="https://badge.socket.dev/npm/package/nwsapi" alt="Socket Badge" height="20"></a>
<picture><img src="https://raw.githubusercontent.com/dperini/nwsapi/refs/heads/prerelease/3.0.0/assets/repo/coverage.svg?v=d3f1fd881dda" height="20" alt="Coverage" /></picture>

Fast CSS selectors API engine with zero dependencies that works in Node.js and browsers.

`nwsapi` builds on [`nwmatcher`](https://github.com/dperini/nwmatcher) with [Selectors Level 4](https://drafts.csswg.org/selectors-4/) features such as `:is()`, `:where()`, and `:has()`, plus state selectors such as `:open` and `:modal`.
See the [measured selector compatibility](docs/repo/selector/compatibility.md) and [API reference](docs/repo/selector/api.md).

## Performance

[![nwsapi vs @asamuzakjp/dom-selector: query time, retained heap, and Brotli size on native Chromium DOMs](https://raw.githubusercontent.com/dperini/nwsapi/refs/heads/prerelease/3.0.0/assets/repo/bench/perf-hero.svg?v=9645cd2b6092)](docs/repo/perf/benchmarks.md)

<details>
<summary>How the benchmarks work</summary>

- **Speed:** 36 selectors, all matches, equal weight. Setup and loading excluded.
- **Memory:** retained heap after 100 distinct queries and garbage collection.
- **Size:** Brotli-compressed browser libraries. No `jsdom`.

- [Cases, methodology, and recorded samples](docs/repo/perf/benchmarks.md).

</details>

[Performance](docs/repo/perf/benchmarks.md) · [Memory](docs/repo/perf/benchmarks.md#memory-footprint) · [File size](docs/repo/perf/benchmarks.md#file-size) · [Compliance](docs/repo/selector/compatibility.md#comparison-results) · [Inside the compiler](docs/repo/perf/design.md)

## Install

```sh
pnpm add nwsapi
```

## In `jsdom`

Use `nwsapi` directly:

```js
const { JSDOM } = require('jsdom')
const { window } = new JSDOM('<p class="item">Hello</p>')
const nw = require('nwsapi')(window)
const items = nw.select('.item', window.document)
window.close()
```

[Replace the `jsdom` selector engine](docs/repo/perf/jsdom.md#override-and-peer-dependency) · [Query benchmarks](docs/repo/perf/jsdom.md)

## In browser

Load `src/nwsapi.js` from the package:

```html
<script src="nwsapi.js"></script>
<script>
  const items = NW.Dom.select('.item', document)
  const firstItem = NW.Dom.first('.item', document)
</script>
```

## API

See the [full API reference](docs/repo/selector/api.md) for all methods, options, and adapter APIs.

<!-- <onboarding> -->

## Contribute

From the checkout root, install and prepare the checkout:

<!-- onboarding:pnpm-install:start -->

```sh
pnpm i
```

<!-- onboarding:pnpm-install:end -->

This installs dependencies, prepares pinned tools, and builds the package.

[Make your first change](docs/repo/development/first-change.md) · [Toolchain and setup help](docs/repo/development/toolchain.md)

<details>
<summary>Use npm or repair setup</summary>

<blockquote>

Setup provisions the pinned tools. With npm, use:

<!-- onboarding:npm-install:start -->

```sh
npm i
```

<!-- onboarding:npm-install:end -->

Repair setup with pnpm:

<!-- onboarding:bootstrap:start -->

```sh
pnpm go
```

<!-- onboarding:bootstrap:end -->

With npm, run `npm run go`. If a package-manager command cannot start, run Node directly from the checkout root:

```sh
node scripts/repo/setup/bootstrap.mts
```

[Missing tools? Start here](docs/repo/development/toolchain.md).

</blockquote>

</details>

<details>
<summary>For agents</summary>

<blockquote>

List tasks:

<!-- onboarding:task-discovery:start -->

```sh
pnpm --silent run dev --list --json
```

<!-- onboarding:task-discovery:end -->

Check setup:

<!-- onboarding:readiness:start -->

```sh
pnpm --silent run dev --task setup:check --json
```

<!-- onboarding:readiness:end -->

[Agent task contract](docs/repo/development/toolchain.md#agent-harnesses).

</blockquote>

</details>

<!-- </onboarding> -->

[Testing](docs/repo/testing/upstream.md) · [Build and packaging](docs/repo/build/design.md) · [Contributor tools](docs/repo/development/contributor-tools.md)

## Sponsor

[GitHub Sponsors](https://github.com/sponsors/dperini) · [Open Collective](https://opencollective.com/nwsapi) · [Patreon](https://www.patreon.com/dperini)
