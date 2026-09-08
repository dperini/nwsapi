# Selector benchmarks and footprint

NWSAPI v2.3.0-prerelease and `@asamuzakjp/dom-selector` run as standalone libraries on native Chromium DOMs.
**Every chart on this page compares library to library, without jsdom.**
The browser's own selector methods are used only as the correctness oracle, outside measured calls.
The saved reports identify the browser version, CPU, library versions, source hashes, fixture hashes and raw samples.

## First matches

![Direct library cold and warm first-match times](../assets/repo/bench/perf-hero.svg?v=2f150ef1f947)

The hero calls NWSAPI's `first()` and the comparison library's `querySelector()` directly.
Both engines receive their own native document containing identical HTML.
Both are initialized before timing starts.
See [cold and warm queries](#cold-and-warm-queries) for the method.

## All-results comparison

The category charts call NWSAPI's `select()` and the comparison library's `querySelectorAll()` directly.
They measure warm queries and retain every timing sample.
Queries must return the same nodes in the same order as native Chromium, before and after measurement.
Unsupported or incorrect results receive no timing bar and fail the comparison run.

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
The [first-match report](../assets/repo/bench/first-query-states.json) includes cold and warm samples.
Run measurements separately from tests and other CPU work.
Results describe these queries and fixtures, not every application's performance.

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

## Memory footprint

![Standalone engine retained memory](../assets/repo/bench/memory-footprint.svg?v=535e36f2bd8e)

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

## Browser file size

![Minified and compressed browser file sizes](../assets/repo/bench/file-size.svg?v=01974565e154)

This is a file size report, not a timing benchmark.
NWSAPI uses its published `dist/nwsapi.min.js` core browser file.
The comparison engine is bundled with all runtime dependencies and no tree shaking, then minified with the same Rolldown minifier.
The report includes uncompressed bytes, gzip level 9 and Brotli quality 11.
The [raw size report](../assets/repo/bench/file-size.json) records exact artifact hashes and every bundled comparison module.

The comparison excludes jsdom itself, the NWSAPI CLI, the jsdom adapter and its optional `css-tree` peer.
It measures these browser artifacts, not npm tarballs or total installation size.

## Component queries

Queries for controls inside repeated cards, using classes, attributes and parent-child relationships.

![Component queries](../assets/repo/bench/components-1.svg?v=252587749de5)

## Documentation queries

Queries for links and definition entries in a large documentation fixture.

![Documentation queries](../assets/repo/bench/documentation/documentation-1.svg?v=568a19a6eaad)

## Utility-class queries

Queries for navigation links and card content in nested utility-class HTML.

![Utility-class queries](../assets/repo/bench/atomic/atomic-1.svg?v=be00d65cd37f)

## Basic selectors

![Basic selectors](../assets/repo/bench/identifiers-1.svg?v=7db94f83a5e6)

## Attribute selectors

![Attribute selectors](../assets/repo/bench/attributes-1.svg?v=f6e289d7ae16)

## Relationships

![Relationships](../assets/repo/bench/relationships-1.svg?v=5d84fa29740c)

## Position selectors

![Position selectors](../assets/repo/bench/positional-1.svg?v=9c454a8ffe7c)

## Logical selectors

![Logical selectors](../assets/repo/bench/logical-1.svg?v=f993392f97f9)

## Form state selectors

![Form state selectors](../assets/repo/bench/forms-1.svg?v=489e971f1653)

## Cold and warm queries

Cold means the first query on a freshly initialized engine and native document.
The runner times a batch of eight cold calls, each on a separate engine/document, and divides by eight to reduce timer noise.
Warm means repeated calls after at least 20ms of warmup.
The first-match chart shows medians across nine rounds, using identical fixture HTML for both libraries.

Each query has one line per engine. Green and teal identify NWSAPI; purple and pink identify `@asamuzakjp/dom-selector`.
Each line connects the cold and warm markers on a shared logarithmic time scale.
Further left means less time. Each labeled step multiplies time by ten.
The text below each pair states whether NWSAPI was faster or slower, including the comparison factor.
The SVG tooltips retain absolute timing values.

The fixture contains component, utility-class and test-ID patterns. It does not execute application frameworks.
The chart covers tags, classes, attributes, relationships, positions, lists, negation, `:is()` and `:where()`.
See the [performance guide](performance.md) for compiler implementation details.
