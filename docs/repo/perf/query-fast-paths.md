# Common query fast paths

A **fast path** handles a common query with fewer steps than the general query code.
Commits `0b3840b` and `b68e020` added the first changes described here.
They followed the [performance review](review.md).

The measurements on this page describe those earlier changes.
See the [performance design](design.md) and [benchmark report](benchmarks.md) for later results.

## What changed

Simple `first()` queries can read the first suitable element from a native tag or class collection.
They avoid copying every candidate into an array.
A **candidate** is an element that the engine may need to test.
If the first candidate matches, these queries also avoid compiling a matching function and reading the collection length.
More complex selectors and older DOM implementations use the general query code.
The changes preserve query scope, document switching, and callbacks.

A query such as `div.example > p > a` can start from matching `div.example` elements.
The engine then finds links within those elements and checks each link's parent chain.
If there are too many starting elements, it uses the general matching function instead.
Nested starting elements still produce unique results in document order.
Every query observes the current document.

Queries for a fixed child position can share work between candidates with the same parent.
When there are few candidates, a short sibling search can cost less.
The engine keeps this position information only for the current query.
A callback that starts another query gets separate state.

The compiler can place simple class and ID checks directly inside `:is()` and `:where()` matching functions.
For some tag alternatives, it combines tag collections instead of scanning every element.
It uses a broader scan when that costs less.
Small, limited routing hints help it choose between these methods.
The engine checks those hints again every 64 calls.
The hints do not store matching elements.

## Native collection snapshots

A **snapshot** is a saved copy of the elements in a native tag or class collection.
Large collections can reuse these internal lists to avoid repeated DOM property reads.
Simple tag and class queries return a fresh copy of the list.
More complex queries still test their attributes and relationships on every call.

The engine discards affected snapshots when elements are added or removed, or when class attributes change.
Before reuse, `MutationObserver.takeRecords()` checks for pending changes immediately.
The engine does not wait for an observer callback to make results correct.
The callback also discards old snapshots when no further query runs.

Snapshot keys use weak references, which do not keep unused objects alive.
The design covers detached elements and elements moved to another document.
Older DOM implementations and hosts without the required APIs use ordinary collection copies.
Standalone collections with fewer than 16 elements use the direct copy path.
Descendant and child-chain queries can also reuse smaller collections.
These queries can repeat lookups within the same part of a document.

Observer callbacks hold their state weakly.
Where supported, finalization disconnects observers after their state becomes unused.
Candidate arrays remain in memory while their collections are reachable and unchanged.
Frequent document changes cause the engine to rebuild these arrays.
Sibling positions and state-selector results are not saved between queries.

Tests cover element insertion and removal, class changes, SVG, detached elements, and moves between documents.
They also cover changes to returned arrays and callbacks that start another query.
A memory diagnostic forced garbage collection while the original document stayed alive.
It reclaimed all tested removed nodes and observers after pending changes were delivered and the engine returned to its document context.

Run the diagnostic with:

```sh
node --expose-gc scripts/repo/bench/collection-memory.mts
```

## Measurements

The saved-build comparison used baseline commit `c446b16`, Node.js v26.5.0, `jsdom` v30.0.1, and `@asamuzakjp/dom-selector` v8.3.2.
The runner changed engine order between passes.
These measurements used repeated queries on generated component and documentation pages.
They did not measure process startup or a running application.

The [all-results comparison](../../../assets/repo/bench/source-comparison.json) recorded an **8.72×** improvement over the baseline for `div.example > p > a`.
It recorded **1.83×** for `div:nth-last-child(3)` and **1.14×** for `:where(.card) > button`.
The child-chain query became about as fast as the competitor.
The position and `:where()` queries remained slower in that historical run.

The [earlier first-match comparison](https://github.com/dperini/nwsapi/blob/e97a57e/assets/repo/bench/first-match-results.json) used nine passes of 1,000 calls per engine after warmup.
The table shows microseconds per query.
“Updated build” identifies the changed engine from that run.

| Query            | Previous master | Updated build | jsdom default |
| ---------------- | --------------: | ------: | ------------: |
| `.card`          |          39.654 |   0.284 |         1.291 |
| `button`         |          44.265 |   0.269 |         1.576 |
| `button.primary` |          54.259 |   0.361 |         1.920 |
| `input.input`    |          51.284 |   0.354 |         2.971 |


For these four queries, the updated build was about **140–165× faster than the baseline**.
It was **4.5–8.4× faster than the default `jsdom` query path**.
The tests called NWSAPI directly and called the competitor through `document.querySelector()` in `jsdom`.
The `jsdom` method includes additional integration work.
A separate comparison through equivalent adapters is needed to measure that difference.

The runner checked that each query returned the expected element before timing.
Separate browser tests compared the optimized selectors with Chromium.

The [report for those commits](https://github.com/dperini/nwsapi/blob/e97a57e/docs/benchmarks.md) recorded 32 lower medians and four higher medians than `@asamuzakjp/dom-selector`.
Sixteen queries were at least 2× faster.
Some differences were small enough that normal timing variation could change their order.
At that stage, general position formulas, reverse positions, `:where()` child checks, and plain child relationships still needed work.
The first-match results were measured separately and were not included in that count.

To repeat the first-match comparison, build the baseline and save its `src/nwsapi.js` file.
Then build the version that you want to test and run:

```sh
node scripts/repo/run.mts scripts/repo/bench/first.mts /path/to/before.cjs /tmp/first-results.json
```

The output records timing samples, package versions, CPU details, and hashes for the source files and test HTML.
See [the benchmark guide](benchmarks.md) for the all-results runner and its Chromium checks.
The current timing runners use `mitata`. The tables on this page predate that change.

## Experiments and validation

Always combining tag collections was about 3× slower on a generated tree with many matching elements.
Checking the number of matches on every call also cost too much.
Periodic checks kept the benefit for queries with few matches without adding that check to every call.

Walking through children directly improved the selective child-chain query.
Searching for the final tag within each starting element performed better and became the chosen implementation.

Validation at that revision passed 617 Node.js and browser tests and 58 WPT checks.
WPT means Web Platform Tests.
Two existing tests were marked as expected failures at that time.
Formatting, lint, type, generated API, and SVG checks also passed.
These are historical results, not a new test run.

The regression tests covered document changes, nested starting elements, and changes between small and large candidate sets.
They also covered fragments, XML, quirks mode, older DOM implementations, callbacks, document switching, and repeated position checks.
