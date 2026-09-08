# Selector benchmarks

**36 of 36 lower all-results medians**, with **32 at least 2× faster**, against
`@asamuzakjp/dom-selector` 8.3.2. The first-match comparison records
**1.6–8.2× faster first matches** across 12 nonempty component queries.

These results describe the current 2.3.0-prerelease source on Node.js 26.5.0,
jsdom 30.0.1, and an Apple M3 Max. They measure warm queries on the listed
fixtures. NWSAPI is called directly; jsdom's public selector methods include
integration overhead. Some margins are small and samples vary with machine
load. These measurements do not establish a win for every possible selector,
a cold-start improvement, browser speed, or whole-application performance.

Native tag/class memberships use [mutation-aware snapshots](common-query-fast-paths.md#native-collection-snapshots).
Simple queries return fresh array copies; compound predicates and relationships
still execute. Mutation-heavy workloads rebuild snapshots. The raw data records
all samples, call counts, versions, and source hashes.

## First matches

First-match plans reuse parsed candidates and compiled predicates, and stop
once each selector group has a result. The simple class/tag paths avoid
compilation entirely. Single-element positional checks avoid building full
sibling indexes. See the [performance guide](performance.md).

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

Medians from nine rounds of 1,000 calls per engine, after at least 100 ms of
warmup per selector across the engines. Engine order rotates between rounds.
The generated component fixture contains 300 cards.
[Raw samples and source hashes](../assets/repo/bench/first-match-results.json)
also include the saved pre-change build and two absent-match cases. Both absent-match cases are faster than jsdom's default engine in this run.
The table uses microseconds; the all-results charts below use milliseconds.

<details>
<summary>Repeat the first-match comparison</summary>

Save `src/nwsapi.js` after building the baseline revision, then build the
candidate and run:

```sh
node scripts/repo/run.mts scripts/repo/bench/first.mts /path/to/before.cjs /tmp/first-results.json
```

The diagnostic verifies exact node identity against jsdom before timing.
Browser regression tests independently check the optimized selector forms
against Chromium. The output includes raw samples, versions, CPU, and source
and fixture hashes.

</details>

## All-results comparison

Compare NWSAPI 2.2.27, 2.3.0-prerelease, and `@asamuzakjp/dom-selector`
in one run. The prerelease label identifies the current source, not a published release.

Extract the published baseline package, then run:

```sh
pnpm run bench --baseline /path/to/nwsapi-2.2.27/package
```

Results go to `assets/repo/bench/`. Each SVG contains at most four selectors
from one category. `results.json` records every timing sample, package
versions, source hashes, the fixture hash, and the test machine.

<details>
<summary>How measurements work</summary>

All engines use their default settings and query the same fixture in each group.
Before timing, Chromium checks
the same fixture. Each engine must return the same elements in the same order,
using their document positions to compare across hosts. Install Chromium with
`pnpm exec playwright install chromium` before the first run.
Unsupported selectors and incorrect results have no timing bar. A candidate
mismatch also makes the command fail.

The runner warms each query, rotates engine order between rounds, and reports
the median time per query. Lower is better. These measurements cover warm
queries, not browser performance, cold starts, or memory use. Results depend
on the machine and fixture; compare engines from the same run.
Labels show two decimal places. Bold marks the lowest unrounded median,
including exact ties. The raw samples keep their full precision.

Use `--rounds 3 --iterations 10 --min-round-ms 0 --output /tmp/nwsapi-bench` for a quick check.
The recorded report uses nine rounds, at least 100 calls per engine per round,
and a 50 ms minimum duration per sample. Faster paths repeat 100-call batches
until that duration is reached; raw `sampleIterations` records every count.
Use `--min-round-ms 0` for fixed-count measurements. No timing samples are
discarded. Correctness is checked before timing and again after warm execution.

</details>

<details>
<summary>Other measurements</summary>

The original selector presets, cache sweep, host-access checks, and memory
measurements are also available. Run `pnpm run build` first.

```sh
pnpm run bench:selectors --list
pnpm run bench:accessors --doc components
pnpm run bench:cache --limits 1000,4096
pnpm run bench:memory --count 200
```

The selector preset runner uses jsdom as a reference. Use `pnpm run bench`
for the browser-checked comparison charts. Cache and memory commands enable
garbage collection through the repository launcher.

</details>

## Component queries

Find controls inside repeated cards using classes, attributes, and relationships.
This generated fixture models component tests; it is not a production trace.

![Component queries](../assets/repo/bench/components-1.svg)

## Documentation queries

Find links, definition entries, and table cells in the existing specification-page fixture.
These queries exercise descendant and ancestor filtering on a larger document.

![Documentation queries](../assets/repo/bench/documentation/documentation-1.svg)

## Utility-class queries

Find navigation links and card content in the existing utility-class fixture.
It includes both narrow and broad containers to exercise traversal routing.

![Utility-class queries](../assets/repo/bench/atomic/atomic-1.svg)

## Basic selectors

![Basic selectors](../assets/repo/bench/identifiers-1.svg)

## Attribute selectors

![Attribute selectors](../assets/repo/bench/attributes-1.svg)

## Relationships

![Relationships](../assets/repo/bench/relationships-1.svg)

## Position selectors

![Position selectors](../assets/repo/bench/positional-1.svg)

## Logical selectors

![Logical selectors](../assets/repo/bench/logical-1.svg)

## Form state selectors

![Form state selectors](../assets/repo/bench/forms-1.svg)

## Further work

See the [optimization notes](common-query-fast-paths.md) for before/after
measurements and the [performance review](performance-review.md) for the
remaining gaps and acceptance targets.

## Warm and cold queries

The README chart uses the [warm and cold results](../assets/repo/bench/first-query-states.json). Each query has two lines for each state. Green shows NWSAPI. Purple shows `@asamuzakjp/dom-selector` through jsdom. Shorter lines show less time.

A warm query repeats a selector after a 20 ms warmup. A cold query is the first query on a fresh document. Cold measurements exclude document creation and explicit NWSAPI factory setup. They include any setup that jsdom performs inside its first public query. They do not measure a new Node.js process.

The columns use separate scales. Warm times are in microseconds. Cold times are in milliseconds. One millisecond equals 1,000 microseconds. Compare engines within a column; do not compare line lengths across columns.

Each engine gets its own document. The runner changes selector order and alternates engines across nine rounds. It records one cold call and 1,000 timed warm calls per document. It checks the result against an element identified before timing, without warming a selector cache on that document. The chart includes the nonempty queries from the existing first-match fixture.

The recorded warm speedups range from 1.9× to 8.2×. The cold results are mixed. NWSAPI takes longer for `.card`, `button.primary`, `input.input`, and `.card > button.primary`. The chart shows these differences. Do not treat the warm headline as a claim about cold queries.

Run the measurement separately from tests and other CPU work. Then regenerate the chart:

```sh
pnpm run build
node scripts/repo/bench/first-query-states.mts
node scripts/repo/gen/readme-performance.mts
```

The [query chart helper](../scripts/repo/bench/query-chart.mts) handles the layout, colors, animation, and notes. Pass engine names, rows, and notes to `queryChart()`. Times use milliseconds in both input columns. The helper converts warm times to microseconds for display. It sizes the canvas from the row and note counts. The `bottomPadding` option defaults to 40 pixels. Notes can contain plain text and `{ code: 'package-name' }` parts.
