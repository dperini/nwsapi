# Common query fast paths

Implemented in `0b3840b` and `b68e020`, following the
[performance review](performance-review.md). These changes improve common
query shapes; the goal of a decisive lead in every category remains open.
These are historical measurements. See the [V8 analysis](v8-performance.md)
and [current benchmarks](benchmarks.md) for the subsequent first-match work.

## What changed

- Simple `first()` queries for a type, class, or type/class compound read
  the native collection's first qualifying item. They avoid copying all
  candidates, compiling a resolver, and reading the live collection's length
  when the first candidate already matches. Scope, document switching, and
  callbacks are preserved; complex syntax and legacy hosts keep the general path.
- Selective class anchors followed by child type chains, such as
  `div.example > p > a`, use scoped type lookups and verify the exact parent
  chain. Wide anchor sets use the ordinary resolver. Nested anchors preserve
  order, and each query observes the current DOM.
- Constant child positions share a parent's qualifying child across dense
  sibling candidates. Sparse candidates retain the bounded sibling walk.
  This state is local to the resolver invocation, including nested calls.
- Simple class/ID compounds in `:is()` and `:where()` compile inline.
  Terminal type unions can fetch and merge ordered type collections when
  selective. Dense unions use a broad scan. Bounded, context-specific routing
  hints are rechecked every 64 calls; they retain no DOM results and cannot
  supply a stale answer.

## Native collection snapshots

Large tag and class candidate collections now reuse immutable internal snapshots.
Public calls receive fresh arrays; compiled predicates still run on every query.
This avoids repeated host-property access when copying native HTMLCollections.
Simple tag/class queries can return a fresh copy of this membership snapshot.
Compound predicates and relationships are evaluated on every query.

Snapshots are keyed weakly by native collections and their observed tree roots.
Child-list changes and class-attribute changes discard a root's snapshots.
Before reuse, `MutationObserver.takeRecords()` checks pending changes synchronously;
correctness does not wait for the observer callback. The callback also discards
snapshots when no further query runs. Detached scopes and adopted elements remain
covered; hosts without the required APIs and legacy mode use ordinary copies.
Standalone collections below 16 elements stay on the direct path. Descendant and selective-child plans also reuse small scoped collections, where repeated lookups dominate traversal. Observer callbacks live outside engine closures and hold state weakly; where supported, finalization disconnects observers for discarded state.

The tradeoff is lazy mutation observation and retained candidate arrays while
collections remain reachable and unchanged. Mutation-heavy workloads rebuild these
snapshots. No sibling positions or state-selector answers survive a query. Regression
tests cover synchronous insertion/removal, class changes, adoption, SVG, detached
contexts, returned-array mutation, and reentrant callbacks. A forced-GC diagnostic
collected all 20 discarded snapshot states on a still-live document and all 100 removed test subtrees after returning the engine to its document
context and delivering mutation records.

Run `node --expose-gc scripts/repo/bench/collection-memory.mts` to check detached-node and observer ownership with a live factory document.

## Measurements

The saved-build comparison used previous master `c446b16`, Node 26.5.0,
jsdom 30.0.1, and dom-selector 8.3.2. Engines rotate order between rounds.
These are warm queries on generated component and documentation fixtures,
not cold-start measurements or application traces.

In the [interleaved all-results comparison](../assets/repo/bench/source-comparison.json),
the selective child chain improved **8.72×** over previous master,
`div:nth-last-child(3)` improved **1.83×**, and
`:where(.card) > button` improved **1.14×**. The child chain reached roughly
parity with dom-selector; the positional and `:where()` cases still lost.

The [first-match comparison](https://github.com/dperini/nwsapi/blob/e97a57e/assets/repo/bench/first-match-results.json)
used nine rounds of 1,000 calls per engine, after warmup. Times are
microseconds per query:

| Query            | Previous master | Current | jsdom default |
| ---------------- | --------------: | ------: | ------------: |
| `.card`          |          39.654 |   0.284 |         1.291 |
| `button`         |          44.265 |   0.269 |         1.576 |
| `button.primary` |          54.259 |   0.361 |         1.920 |
| `input.input`    |          51.284 |   0.354 |         2.971 |

That is roughly **140–165× over previous master** and **4.5–8.4× over
jsdom's default querySelector path** for these four queries. NWSAPI is called
directly; jsdom's public method includes its integration overhead. A comparison
of both engines installed through equivalent jsdom adapters is still needed.
The diagnostic checks exact node identity against jsdom before timing; browser
regression tests independently verify the optimized forms against Chromium.

The [report for those commits](https://github.com/dperini/nwsapi/blob/e97a57e/docs/benchmarks.md) records 32 lower medians
and four higher medians than dom-selector, with 16 cases reaching 2×.
Several margins are near noise, including the child-chain parity result.
General positional formulas, reverse positions, `:where()` child predicates,
and plain child relationships still need work. First-match results are a
separate workload and are not included in that win count.

To repeat the first-match comparison, save `src/nwsapi.js` after building
the baseline revision, then build the candidate and run:

```sh
node scripts/repo/run.mts scripts/repo/bench/first.mts /path/to/before.cjs /tmp/first-results.json
```

The output records raw samples, source and fixture hashes, versions, and CPU.
See [benchmarks](benchmarks.md) for the Chromium-checked all-results runner.

## Experiments and validation

Unconditional type-union merging was about 3× slower on a dense synthetic
tree. Checking density on every call also cost too much. Periodic routing
probes preserve the sparse-query benefit without paying that scan every time.
Direct child-by-child traversal improved the selective chain, but scoped
terminal-type lookup performed better and became the final implementation.

Validation: 617 Node/browser tests passed, two existing expected failures,
58 WPT harness tests passed, and formatting, lint, type, generated API, and
SVG checks passed. Regression coverage includes mutations, nested-anchor
ordering, dense/sparse transitions, fragments, XML, quirks, legacy mode,
callbacks, document switching, and repeated positional predicates.
