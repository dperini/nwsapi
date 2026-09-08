# Selector benchmarks

**1.7–8.9× faster first matches** across 12 nonempty component queries, and
**31 of 36 lower all-results medians**, with 16 at least 2× faster, in the
recorded comparison against `@asamuzakjp/dom-selector` 8.3.2.

These results describe the current 2.3.0-prerelease source on Node.js 26.5.0,
jsdom 30.0.1, and an Apple M3 Max. They measure warm queries on the listed
fixtures. NWSAPI is called directly; jsdom's public selector methods include
integration overhead. Some all-results margins are near noise and five
queries remain slower. These are not cold-start, browser-speed, or whole-app
measurements.

## First matches

First-match plans reuse parsed candidates and compiled predicates, and stop
once each selector group has a result. The simple class/tag paths avoid
compilation entirely. Single-element positional checks avoid building full
sibling indexes. See the [V8 analysis](v8-performance.md).

| Query | NWSAPI (µs) | jsdom default (µs) | Speedup |
| --- | ---: | ---: | ---: |
| `.card` | 0.253 | 0.968 | 3.8× |
| `button` | 0.246 | 1.281 | 5.2× |
| `button.primary` | 0.338 | 1.731 | 5.1× |
| `input.input` | 0.323 | 2.722 | 8.4× |
| `.card > button.primary` | 0.415 | 2.129 | 5.1× |
| `[data-testid]` | 1.112 | 9.950 | 8.9× |
| `div > button` | 0.381 | 1.700 | 4.5× |
| `:where(.card) > button` | 0.380 | 1.728 | 4.5× |
| `div:nth-child(2n)` | 0.776 | 3.057 | 3.9× |
| `input, button` | 0.951 | 5.019 | 5.3× |
| `:is(button, input)` | 1.210 | 2.028 | 1.7× |
| `button:not(.missing)` | 0.357 | 2.453 | 6.9× |

Medians from nine rounds of 1,000 calls per engine, after at least 100 ms of
warmup per selector across the engines. Engine order rotates between rounds.
The generated component fixture contains 300 cards.
[Raw samples and source hashes](../assets/repo/bench/first-match-results.json)
also include the saved pre-change build and two absent-match cases. The
absent `.absent > button` case remains slightly slower than our saved build,
although it is faster than jsdom's default engine in this run.
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

Use `--rounds 3 --iterations 10 --output /tmp/nwsapi-bench` for a quick check.
Use the default nine rounds and 100 iterations for the recorded report.

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
