# Public `jsdom` query performance

This comparison measures `document.querySelectorAll()` in two real installations of the same `jsdom` version. This run uses `jsdom` 30.0.1. The comparison installation pins `@asamuzakjp/dom-selector` 9.1.1 with an override. The other installation overrides that dependency with the packed `nwsapi` 2.3.0-prerelease build and installs its `css-tree` peer. The benchmark verifies the resolved package names before measuring. This matches the comparison-library version used by the standalone browser benchmark. It does not replace the module cache or call selector engines directly.

<!-- jsdom-summary:start -->

The `nwsapi` override is **5.57× faster** across 36 selectors, using the geometric mean of their speed ratios. Each selector has equal weight. These timings measure repeated queries and exclude application startup.

<!-- jsdom-summary:end -->

<details>
<summary>How the comparison works</summary>

Run `pnpm run bench:jsdom` to build and pack this checkout, install both consumers under `os.tmpdir()`, and measure the same 36 selectors used by the [browser comparison](benchmarks.md#all-results-comparison). Installation needs registry access. Temporary consumers are removed when the run finishes.

Each installation receives identical component, documentation, and utility-class documents. Ordered result positions must agree before and after timing. Both installations use the same exact `jsdom` and `css-tree` versions. The report identifies the resolved selector packages, entry hashes, packed artifact hash, lockfile hashes, and fixture hashes.

`mitata` measures nine rounds, rotating engine order, with a 50ms minimum measurement period and batches of 16 calls. Each query receives 100 warmup calls. Reported times are the median of the nine round medians. The raw report retains each round's samples and call counts. Package installation, document construction, engine initialization, warmup, and correctness checks are outside the measured calls. Garbage collection during queries remains part of their cost.

The [recorded data](../../../assets/repo/bench/jsdom-override.json) contains all 36 cases. Run `node scripts/repo/gen/jsdom-benchmark.mts` to regenerate the chart and summary from that report without repeating installation or measurement. These results do not measure document loading, stylesheet calculation, retained memory, or every downstream application's workload.

</details>

![Public jsdom selector query comparison](https://raw.githubusercontent.com/dperini/nwsapi/master/assets/repo/bench/jsdom-override.svg?v=c2f96f2c2de8)

These four examples cover class lookup, attribute presence, form state, and a relational component query. They use the public `jsdom` DOM API, including adapter overhead and the host-supplied readers. The full report also includes the cases where the libraries are closer. Shorter bars mean less query time.

## Override and peer dependency

For a published adapter version, replace `<version>` in this npm `package.json` example:

```json
{
  "dependencies": {
    "jsdom": "30.0.1",
    "css-tree": "3.2.1"
  },
  "overrides": {
    "@asamuzakjp/dom-selector": "npm:nwsapi@<version>"
  }
}
```

Run `npm install`, then use `jsdom` normally:

```js
import { JSDOM } from 'jsdom'

const dom = new JSDOM('<main><button class="primary">Save</button></main>')
const buttons = dom.window.document.querySelectorAll('main > button.primary')
dom.window.close()
```

The benchmark uses a `file:` override pointing to the freshly packed checkout because the measured build may not yet be published. It exercises the package's published file layout and peer resolution. For pnpm, put the same override under `overrides` in `pnpm-workspace.yaml`, as shown in the [installation instructions](../../../README.md#in-jsdom).

The comparison consumer keeps the same dependencies and uses `"@asamuzakjp/dom-selector": "9.1.1"` as its override. Neither library is patched. The 36 timing selectors do not include `#null` or `.null`, which are affected by [PR #344](https://github.com/asamuzaK/domSelector/pull/344). Missing-attribute behavior remains covered by the correctness suite.

## Duplicate IDs and host helpers

`jsdom` supports multiple elements with the same ID. `getElementById()` returns one element, while `querySelectorAll()` must return every matching element in tree order. Supplying `idlUtils` and `domSymbolTree` enables host readers but does not guarantee unique IDs. The adapter therefore keeps `IDS_DUPES` enabled. The helper integration tests cover duplicate IDs in HTML and XML, including reordering, ID changes, removal, and detached fragments.
