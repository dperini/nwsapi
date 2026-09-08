# Selector benchmarks and footprint

NWSAPI v2.3.0-prerelease and `@asamuzakjp/dom-selector` run as standalone libraries on native Chromium DOMs.
**Every chart on this page compares library to library, without jsdom.**
The browser's own selector methods are used only as the correctness oracle, outside measured calls.
The saved reports identify the browser version, CPU, library versions, source hashes, fixture hashes and raw samples.

The README summary uses the geometric mean of the comparison-to-NWSAPI time ratios across all 36 warm all-results queries.
Each query has equal weight. Its memory and file size figures use the retained heap after 100 queries and Brotli bytes reported below.

## All-results comparison

The category charts call NWSAPI's `select()` and the comparison library's `querySelectorAll()` directly.
They measure warm queries and retain every timing sample.
Queries must return the same nodes in the same order as native Chromium, before and after measurement.
The timing charts use thin bars on a shared logarithmic scale so fast queries remain visible.
Bars span from the lowest labeled time to each measured value. Each axis step multiplies time by ten; shorter bars are faster.
Unsupported or incorrect results receive no bar and fail the comparison run.

<details>
<summary>How measurements work</summary>

```sh
pnpm run bench
pnpm run compare:memory
pnpm run report:size
pnpm run gen:bench
```

Install Chromium with `pnpm exec playwright install chromium` if needed.
The benchmark runner uses `performance.now()` in a cross-origin-isolated browser context for precise timers.
It runs nine rounds, rotates engine order, warms each query for at least 20ms, and times batches of at least 1,000 calls for at least 50ms.
The median is the middle sample. The JSON files retain all samples and call counts.
Fixture scripts cannot execute. Both libraries run against native DOMs through the same harness.
Document creation, script loading, engine construction and correctness checks happen outside the timers.

For a smoke run:

```sh
pnpm run bench --rounds 3 --iterations 100 --min-round-ms 5 --cold-count 2 --output /tmp/nwsapi-bench
```

The raw all-results data lives in [components](../assets/repo/bench/results.json), [documentation](../assets/repo/bench/documentation/results.json) and [utility classes](../assets/repo/bench/atomic/results.json).
The [first-match report](../assets/repo/bench/first-query-states.json) includes [cold and warm samples](#cold-and-warm-samples).
Run measurements separately from tests and other CPU work.
Results describe these queries and fixtures, not every application's performance.

</details>

<details>
<summary>Cold and warm samples</summary>

<a id="cold-and-warm-samples"></a>

The first-match comparison calls NWSAPI's `first()` and the comparison library's `querySelector()` directly.
Each engine receives its own native document containing identical HTML and is initialized before timing starts.

Cold means the first query on a freshly initialized engine and document.
The runner times a batch of eight cold calls, each on a separate engine/document, and divides by eight to reduce timer noise.
Warm means repeated calls after at least 20ms of warmup.
The chart shows medians across nine rounds.

The first-match chart selects the four queries with the largest warm-query speedups for NWSAPI.
The [raw first-match report](../assets/repo/bench/first-query-states.json) retains all 12 queries, covering tags, classes, attributes, relationships, positions, lists, negation, `:is()` and `:where()`.
The fixture contains component, utility-class and test-ID patterns; it does not execute application frameworks.

Each line connects cold and warm times on a shared logarithmic scale; further left means less time.
The SVG tooltips retain absolute timing values.
See the [performance guide](performance.md) for compiler implementation details.

</details>

<details>
<summary>Other measurements</summary>

The existing Node-based diagnostics remain available, separately from the browser comparisons above:

```sh
pnpm run bench:selectors --list
pnpm run bench:accessors --doc components
pnpm run bench:cache --limits 1000,4096
pnpm run bench:memory --count 200
pnpm run compare:memory:jsdom
```

These diagnostics use jsdom and are not the source of any chart on this page.
The memory diagnostics enable explicit garbage collection.

</details>

## Component queries

![Component queries](https://raw.githubusercontent.com/dperini/nwsapi/master/assets/repo/bench/components-1.svg?v=e24a0a3cfcab)

Queries for controls inside repeated cards, using classes, attributes and parent-child relationships.

## Documentation queries

![Documentation queries](https://raw.githubusercontent.com/dperini/nwsapi/master/assets/repo/bench/documentation/documentation-1.svg?v=50991b2e7b35)

Queries for links and definition entries in a large documentation fixture.

## Utility-class queries

![Utility-class queries](https://raw.githubusercontent.com/dperini/nwsapi/master/assets/repo/bench/atomic/atomic-1.svg?v=39599a36d68a)

Queries for navigation links and card content in nested utility-class HTML.

## Basic selectors

![Basic selectors](https://raw.githubusercontent.com/dperini/nwsapi/master/assets/repo/bench/identifiers-1.svg?v=475027d3348b)

ID, class, tag and combined tag/class queries in the component fixture. These provide a baseline for the more complex selectors below.

## Attribute selectors

![Attribute selectors](https://raw.githubusercontent.com/dperini/nwsapi/master/assets/repo/bench/attributes-1.svg?v=b54135463158)

Queries for attribute presence, exact values, value prefixes and whitespace-separated tokens. The fixture uses test IDs and class attributes.

## Relationships

![Relationships](https://raw.githubusercontent.com/dperini/nwsapi/master/assets/repo/bench/relationships-1.svg?v=7266322bab33)

Descendant, direct-child, adjacent-sibling and general-sibling queries. These find controls and content through their positions relative to other elements.

## Position selectors

![Position selectors](https://raw.githubusercontent.com/dperini/nwsapi/master/assets/repo/bench/positional-1.svg?v=bffe0cea19d2)

Queries for first, last and numbered children. The cases count siblings from both ends and include an even-position pattern.

## Logical selectors

![Logical selectors](https://raw.githubusercontent.com/dperini/nwsapi/master/assets/repo/bench/logical-1.svg?v=7235d776b155)

Queries using `:not()`, `:is()`, `:where()` and `:has()`. The cases cover exclusion, selector alternatives and parents with matching children.

## Form state selectors

![Form state selectors](https://raw.githubusercontent.com/dperini/nwsapi/master/assets/repo/bench/forms-1.svg?v=e62e7d0a2b19)

Queries for enabled, disabled, optional and read-write controls. Results reflect the control states in the component fixture.

## First matches

![Direct library cold and warm first-match times](https://raw.githubusercontent.com/dperini/nwsapi/master/assets/repo/bench/first-matches.svg?v=474e92c12e19)

Direct `first()` and `querySelector()` calls with cold and warm engines. The chart highlights the four queries with the largest warm-query speedups for NWSAPI; the [raw report](../assets/repo/bench/first-query-states.json) retains all 12 queries.

## Memory footprint

![Standalone engine retained memory](https://raw.githubusercontent.com/dperini/nwsapi/master/assets/repo/bench/memory-footprint.svg?v=3f968c4fa6f7)

This comparison measures **additional retained JavaScript heap per engine**, not total browser or DOM memory.
It preallocates 40 native iframe documents and loads both library modules before the baseline reading.
It then measures engine initialization and 100 distinct, correctness-checked queries per engine.
Chromium performs four garbage collections, separated by event-loop turns, before each reading.
Engines and documents remain reachable through the final reading.
Each engine and round gets a fresh browser page, and engine order alternates across five rounds.

The chart reports medians. The [raw memory report](../assets/repo/bench/memory-footprint.json) also includes minimums, maximums and every sample.
DOM allocation, shared library code, native browser allocations and jsdom overhead are excluded.
This is a retained-memory comparison; it does not measure peak allocation or total process memory.
Claims of lower memory apply to this workload and the listed library versions.

## File size

![Minified and compressed browser file sizes](https://raw.githubusercontent.com/dperini/nwsapi/master/assets/repo/bench/file-size.svg?v=6a93a1b3c0ec)

This is a file size report, not a timing benchmark.
NWSAPI uses its published `dist/nwsapi.min.js` core browser file.
The comparison engine is bundled with all runtime dependencies and no tree shaking, then minified with the same Rolldown minifier.
The report includes uncompressed bytes, gzip level 9 and Brotli quality 11.
The [raw size report](../assets/repo/bench/file-size.json) records exact artifact hashes and every bundled comparison module.

The comparison excludes jsdom itself, the NWSAPI CLI, the jsdom adapter and its optional `css-tree` peer.
It measures these browser artifacts, not npm tarballs or total installation size.
