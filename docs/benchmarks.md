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
sibling indexes. See the [V8 analysis](v8-performance.md).

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

The README overview is generated from these recorded results, including all 12 nonempty first-match queries. Regenerate it after updating the result files with `node scripts/repo/gen/readme-performance.mts`. Empty-result queries remain available in the full first-match report.
