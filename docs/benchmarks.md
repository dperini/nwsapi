# Selector benchmarks

The measurements used NWSAPI v2.3.0-prerelease, Node.js v26.5.0, and `jsdom` v30.0.1 on an Apple M3 Max.
The prerelease version identifies the measured source code.
Each result file records the exact source version and test data.

The tests call NWSAPI directly and call the other engine through `jsdom` methods.
Those methods do additional work, which is included in their measured time.
Small timing differences can change with machine load.
These results apply to the listed queries and test pages.
They do not predict every application's performance or the time needed to start a Node.js process.

## First matches

![Cold and warm first-match times](../assets/repo/bench/perf-hero.svg?v=06285a5bdaad)

See [how cold and warm queries are measured](#cold-and-warm-queries).

NWSAPI stops searching when it has the required first match.
It can reuse the instructions that it prepared for an earlier query.
Simple tag and class queries can avoid compilation.
See the [performance guide](performance.md) for the implementation details.

<details>
<summary>Earlier warm-only results</summary>

This older run measured repeated queries after warmup.
The table shows microseconds per query.

| Query                    | NWSAPI (µs) | jsdom default (µs) | Speedup |
| ------------------------ | ----------: | -----------------: | ------: |
| `.card`                  |       0.255 |              0.978 |    3.8× |
| `button`                 |       0.250 |              1.294 |    5.2× |
| `button.primary`         |       0.340 |              1.714 |    5.0× |
| `input.input`            |       0.344 |              2.830 |    8.2× |
| `.card > button.primary` |       0.391 |              1.959 |    5.0× |
| `[data-testid]`          |       1.008 |              5.196 |    5.2× |
| `div > button`           |       0.376 |              1.614 |    4.3× |
| `:where(.card) > button` |       0.387 |              1.610 |    4.2× |
| `div:nth-child(2n)`      |       0.806 |              2.778 |    3.4× |
| `input, button`          |       0.979 |              4.821 |    4.9× |
| `:is(button, input)`     |       1.200 |              1.889 |    1.6× |
| `button:not(.missing)`   |       0.371 |              2.325 |    6.3× |


The run used nine passes of 1,000 calls per engine.
Each selector had at least 100 ms of warmup before measurement.
The engine order changed between passes.
The generated test page contained 300 cards.

The [raw samples and source hashes](../assets/repo/bench/first-match-results.json) identify the measured builds.
A source hash identifies the contents of a source file.
The results also include two queries that return no match.
NWSAPI was faster than the default `jsdom` engine for both queries in that run.

</details>

<details>
<summary>Repeat the first-match comparison</summary>

Build the version that you want to use as the baseline.
Save a copy of its `src/nwsapi.js` file.
Then build the version that you want to test and run:

```sh
node scripts/repo/run.mts scripts/repo/bench/first.mts /path/to/before.cjs /tmp/first-results.json
```

The runner checks that each query returns the expected element before it measures time.
Separate browser tests check the optimized selectors against Chromium.
The output records timing samples, package versions, CPU details, and hashes for the source and test HTML.

</details>

## All-results comparison

This comparison measures queries that return every matching element.
It compares NWSAPI v2.2.27, NWSAPI v2.3.0-prerelease, and `@asamuzakjp/dom-selector` v8.3.2 through `jsdom`.

Extract the published NWSAPI v2.2.27 package, then run:

```sh
pnpm run bench --baseline /path/to/nwsapi-2.2.27/package
```

The runner writes results to `assets/repo/bench/`.
Each chart shows up to four selectors from one category.
The charts use the same colors, fonts, and spacing as the first-match chart.
Shorter bars mean less time on these linear scales.
The `results.json` files record the samples, versions, source hashes, test HTML hash, and machine details.

<details>
<summary>How measurements work</summary>

All engines use their default settings and the same test HTML.
Chromium runs each query before timing begins.
The other engines must return the same elements in the same order.
The runner compares element positions because each engine has its own document.
Install Chromium before the first run:

```sh
pnpm exec playwright install chromium
```

A query with unsupported syntax or incorrect results has no timing bar.
An incorrect NWSAPI result also makes the command fail.

The timing runners now use `mitata`.
New result files record its version.
The published measurements on this page were collected before this change.

The all-results runner repeats each query to warm it up.
It changes the engine order between passes and reports a median time per query.
A median describes the middle of the measured values.
These charts measure warm queries, so compare them separately from cold queries or memory tests.

Timing labels show two decimal places.
Bold text marks the lowest median before rounding, including exact ties.
The result files keep the full precision of each sample.

For a quick check, add `--rounds 3 --iterations 10 --min-round-ms 0 --output /tmp/nwsapi-bench`.
The `--rounds` option sets the number of passes through the engines.
The saved report used nine passes and batches of 100 calls.
It repeated batches until each measurement reached at least 50 ms.
The `sampleIterations` field records the measured call counts.

The current `mitata` runner also records its batch samples in `mitataSamples`.
Use `--min-round-ms 0` to remove the minimum sample duration.
The runner keeps all timing samples.
It checks query results before measurement and again after the repeated calls.

</details>

<details>
<summary>Other measurements</summary>

Additional commands measure selector groups, cache sizes, DOM property access, and memory use.
Build the JavaScript files with `pnpm run build` first.

```sh
pnpm run bench:selectors --list
pnpm run bench:accessors --doc components
pnpm run bench:cache --limits 1000,4096
pnpm run bench:memory --count 200
```

The selector-group runner compares results with `jsdom`.
Use `pnpm run bench` for the charts that also check results against Chromium.
The cache and memory commands enable explicit garbage collection through the repository launcher.
Garbage collection releases memory that the program no longer needs.

</details>

## Component queries

These queries find controls inside repeated cards.
They use classes, attributes, and parent-child relationships.
The generated HTML models component tests. It does not come from a running application.

![Component queries](../assets/repo/bench/components-1.svg?v=8701ba7b48d0)

## Documentation queries

These queries find links, definition entries, and table cells in a large documentation page.
They test how the engine searches through nested elements.

![Documentation queries](../assets/repo/bench/documentation/documentation-1.svg?v=ed470628ab0b)

## Utility-class queries

These queries find navigation links and card content in HTML with many utility classes.
A utility class represents one styling choice, such as spacing or color.
The test page contains both small and large groups of elements.

![Utility-class queries](../assets/repo/bench/atomic/atomic-1.svg?v=997ffb3036af)

## Basic selectors

![Basic selectors](../assets/repo/bench/identifiers-1.svg?v=05072fd7e219)

## Attribute selectors

![Attribute selectors](../assets/repo/bench/attributes-1.svg?v=3ab03f89cafb)

## Relationships

![Relationships](../assets/repo/bench/relationships-1.svg?v=9088192ab37c)

## Position selectors

![Position selectors](../assets/repo/bench/positional-1.svg?v=05bb0797cb9a)

## Logical selectors

![Logical selectors](../assets/repo/bench/logical-1.svg?v=28cb61a1eb29)

## Form state selectors

![Form state selectors](../assets/repo/bench/forms-1.svg?v=f89715ed79e5)

## Cold and warm queries

The first-match chart uses the [saved cold and warm results](../assets/repo/bench/first-query-states.json).
Cold queries run a selector first on a fresh document. Warm queries repeat it.
The recorded warm queries followed a 20 ms warmup.

Document creation and explicit NWSAPI setup happen before the cold timer starts.
The first `jsdom` query includes any setup that its public method performs.
These measurements do not include starting a new Node.js process.

Each query has two stacked lines, one for each engine.
Green and teal identify NWSAPI. Purple and pink identify `@asamuzakjp/dom-selector` through `jsdom`.
Each line connects a cold marker and a warm marker.
Further left means less time.
The scale is logarithmic: each step increases the time by a factor of ten.
Compare the marker positions to compare query times.

The text below each pair gives the cold and warm comparisons.
Cold times use milliseconds. Warm times use microseconds.
One millisecond equals 1,000 microseconds.
The SVG also contains timing descriptions for viewers that support tooltips.

The saved run used separate documents for each engine and changed the query order across nine passes.
Each document supplied one cold call and 1,000 measured warm calls.
The runner found the expected element before timing without running the selector on that document.
The current `mitata` runner also creates fresh state for each cold invocation, including its warmup calls.
State creation happens outside the timer.

The generated HTML models React/Next.js components, [Tailwind-style utility classes](https://tailwindcss.com/docs/styling-with-utility-classes), and [Testing Library test IDs](https://testing-library.com/docs/queries/bytestid/).
These tests use HTML patterns from those use cases. They do not run the frameworks or libraries.
The selectors cover tags, classes, attributes, parent-child relationships, positions, lists, negation, `:is()`, and `:where()`.
The chart includes the 12 queries that return an element.
The earlier first-match results also contain queries with no match.

The saved cold speedups range from 1.3× to 13.8×.
The warm speedups range from 1.8× to 12.9×.
The [cold-query study](performance.md#cold-first-match-class-queries) explains how the engine avoids scanning a full class collection for early matches.
The [warm-cache follow-up](performance.md#warm-candidate-cache-follow-up) shows how fewer property reads reduced warm query time.

Run benchmarks separately from tests and other CPU work.
Then regenerate the charts:

```sh
pnpm run build
node scripts/repo/bench/first-query-states.mts
node scripts/repo/gen/readme-performance.mts
node scripts/repo/gen/benchmark-charts.mts
```

The [query chart helper](../scripts/repo/bench/query-chart.mts) controls layout, colors, animation, and notes.
Pass engine names, measurements, and notes to `queryChart()`.
Supply both cold and warm measurements in milliseconds.
The helper converts warm times to microseconds for display.
It adjusts the image height to fit the queries and notes.
The `bottomPadding` option defaults to 40 pixels.

Notes accept plain text and `{ code: 'package-name' }` parts.
The `wrapQueryNotes()` helper measures text in Chromium and wraps it inside the side padding.
Its second argument lists the note indexes that must start a new line.
The `metadataStart` option adds space before package and API details and gives those lines a muted color.
Both chart generators can redraw saved measurements without running the benchmarks again.
They also update the image URLs from the SVG contents so GitHub can request changed images.

## Further work

See the [optimization notes](common-query-fast-paths.md) for the earlier changes and their measurements.
The [performance review](performance-review.md) records the original gaps and the proposed targets for future comparisons.
