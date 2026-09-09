# Performance design

See [shared performance practices](../../fleet/perf/practices.md) for experiment design and interpretation.

NWSAPI reads CSS selectors and creates JavaScript functions that test elements.
It saves these functions so later queries can reuse them.
A matching function is called a **resolver**.
An element that the engine may need to test is called a **candidate**.

A first-match query stops after finding the required element.
An all-results query collects each matching element.
These operations can use different methods to avoid repeated work.

The first study on this page examined engine commit `6d79033`.
It used Node.js v26.5.0, V8 v14.6.202.34-node.24, `jsdom` v30.0.1, and an Apple M3 Max.
V8 is the JavaScript engine used by Node.js and Chromium.
Later sections describe the changes that followed that study.
See the [benchmark report](benchmarks.md) for the latest recorded comparisons.
The [performance journal](journal.md) records memory experiments, measured outcomes, and correctness constraints.

## How we measured performance

The [first-match results](../../../assets/repo/bench/first-match-results.json) compare a saved NWSAPI build, an updated build, and `@asamuzakjp/dom-selector` v8.3.2 through `jsdom`.
The runner checks that queries return the expected elements before timing starts.
Separate browser tests compare representative selectors with Chromium.

The measurements call NWSAPI directly and call the other engine through `jsdom` methods.
The `jsdom` methods perform additional work around selector matching.
That work is included in their measured time.

Cold queries run a selector first on a fresh document. Warm queries repeat it.
The separate **cold-compilation test** compiles distinct selector strings to prevent reuse of generated functions.
A cold query can avoid compilation if it uses a simple tag or class path.

A CPU profile samples the functions that are running during a test.
It helps locate work that may be expensive.
The profile starts after document creation and candidate preparation, and stops before document cleanup.
The cold-compilation profile skips warmup and uses distinct selector suffixes.

Each profile phase runs on its own:

- The first-match, all-results, and raw-resolver phases repeat a set of 36 queries 1,000 times.
- The single-element matching phase runs 100,000 times and changes the element under test.
- The cold-compilation phase makes 36,000 compile requests.

The raw-resolver phase passes all elements to the matching function.
It measures that function apart from candidate selection.
Use public-query benchmarks to measure the complete query cost.

## What the profiles showed

The [profile data](../../../assets/repo/bench/v8-analysis.json) records source hashes, sample counts, and machine details.
A source hash identifies the contents of a measured file.

Each percentage below counts samples taken while the function itself was running.
It excludes functions that the function called.
These percentages are estimates of where work occurred.
They are not exact elapsed times, and percentages from separate phases must not be added together.

| Phase                  | Samples | Main observations                                                                                                         |
| ---------------------- | ------: | ------------------------------------------------------------------------------------------------------------------------- |
| Cold compilation       |     471 | `compile` used 79.6% of samples. `compileSelector` used 8.9%. Garbage collection used 3.0%.                               |
| All-results selection  |   6,560 | `byTag` used 11.0%. Attribute lookup used 7.8%. The public selection function used 6.9%. Resolvers used 6.6%.             |
| First match            |   1,097 | Query-plan execution used 18.4%. Attribute lookup used 15.1%. Collection property checks used 14.8%. Resolvers used 8.4%. |
| Single-element match   |   1,216 | Resolvers used 18.9%. Cache lookups used 18.4%. The code that chose the matching function used 6.7%.                      |
| Raw resolver execution |   9,930 | Resolvers used 18.3%. `localName` reads used 9.5%. Ancestor filters used 9.4%.                                            |

Garbage collection releases memory that the program no longer needs.
Ancestor filters skip elements whose parents cannot satisfy a selector.
A query plan stores the steps and functions needed to run a query.

The first-match profile includes queries with no result.
Those queries can inspect many candidates, so this profile also includes long searches.
The `compile` samples include the cost of creating JavaScript functions.
Selector text scanning accounts for only part of that work.

## How the compiler reduces repeated work

NWSAPI creates resolver functions with `Function()` and saves them in a cache.
First-match plans reuse the parser and compiler.
The plan cache stores selector information and functions.
It has a size limit and clears when configuration or document rules change.
Separate candidate caches, described below, can store lists of elements.

The engine compiles all selector groups before testing candidates.
This preserves errors in an invalid group even if an earlier group could match.
It then finds the first match in each group and chooses the earliest result in document order.
It calls the user's callback once, after choosing that result.

Tests cover XML, document fragments, older DOM implementations, and document changes.
They also cover callbacks that start another query.

### Stop early when the first candidate matches

The common collection path reads index zero without copying the collection or reading its length.
If that element does not match, the engine checks the next seven entries.
It reads the collection length before a longer search.

In `jsdom`, collection access can run extra code to manage DOM objects.
Avoiding unnecessary reads reduces that work.
The length check also limits reads past the end of the collection.

### Count only the siblings that are needed

For a single-element `:nth-child()` check, the resolver counts preceding siblings.
For `:nth-last-child()`, it counts following siblings.

An all-results query can share a sibling index between candidates.
Building one index can cost less than counting the same siblings for each element.
Fixed-position selectors keep their existing limited searches.

### Check the code that V8 produces

The recorded first-match trace showed seven completed resolver optimizations and no resolver deoptimizations.
V8 can replace general code with faster code after observing how it runs.
A **deoptimization** occurs when V8 must stop using that optimized code.

The study inspected V8 bytecode and optimized ARM64 machine code.
It checked array bounds, helper calls, and property reads.
Different DOM implementations, selectors, or V8 versions can produce different code.

## Which changes we kept

| Experiment | Decision |
| --- | --- |
| Compile first-match plans. | We kept this change. Repeated calls reuse parsing and planning work. The engine stops after finding the required result. |
| Count siblings in the required direction. | We kept this change for single-element matching. It skips siblings that cannot affect the answer. |
| Use `charCodeAt()` in three selector scans. | We kept this project preference. Comments identify the character for each number. The corrected cold-compilation comparison ranged from about the same speed to a 6% improvement. |
| Copy collection entries by index. | A later update kept this method for large tag collections. It creates a result array with the required size. The earlier experiment had mixed results across complete queries. |
| Pass live collections to all-results resolvers. | We rejected this change. Many common filtered queries became about 20–30% slower in the exploratory run. Arrays without empty slots performed better. |
| Reuse progress through adjacent siblings. | We revised and kept this method for forward `an+b` position formulas. Candidates far apart, callbacks, reverse searches, and older DOM implementations use the existing helpers. |
| Call `item()` while finding the first match. | We rejected this change. The call cost more than the collection-length read it avoided. A limited search by index performed better. |

The compiler also uses numeric ASCII checks to choose how to process selector tokens.
A **token** is a part of a selector, such as a name or operator.
Namespace and extension handling use their existing code paths.

The parser study examined numeric character checks, combined whitespace scans, and reusable state.
Each technique needs to remove enough work to improve a complete query.
NWSAPI already reads each UTF-16 code unit once per scan.
A code unit is a 16-bit part of a JavaScript string.
The changes kept complete DOM string comparisons instead of replacing them with manual character loops.

[V8's scanner article](https://v8.dev/blog/scanner) describes fast handling for common ASCII characters and separate handling for more complex Unicode input.
The effect of `charCodeAt()` in this engine still depends on the measured query.

An early compilation experiment let the second engine reuse functions that V8 had compiled for the first engine.
That made the improvement appear larger than it was.
The corrected runner gives each engine distinct selector suffixes and changes execution order between passes.

An early CPU profile included document setup and cleanup.
The phase analysis excluded those samples.
The rejected experiments record what was tested and why the implementation changed.

## Run the tools

Install the development dependencies, then build the JavaScript files.
Use Node.js v26 for these commands.
The published package includes the `nwsapi` command.
Install the optional `jsdom` peer dependency to use `nwsapi compile`.
The selector engine itself needs no dependencies.
In this checkout, build the CLI before you run it.

```sh
pnpm run build
bin/nwsapi.js compile '.card > button.primary'
bin/nwsapi.js compile --mode match --json 'div:nth-child(2n)'
bin/nwsapi.js compile --mode item --legacy '.card'
```

The CLI prints the generated resolver, its size in bytes, and the helpers it uses.
The generated function can refer to `s` for engine state and `a` for ancestor-filter information.
It still requires the engine's validation, document handling, and candidate selection.
Use the public engine API to run complete queries.
The `compile()` method can return `null` when a matching function is unnecessary.

Run each profile on its own.
If you omit the output path, the tool creates a file in an operating-system temporary directory and prints its location.

```sh
node scripts/repo/bench/profile.mts select
node scripts/repo/bench/profile.mts cold
node scripts/repo/bench/profile.mts first
node scripts/repo/bench/profile.mts match
node scripts/repo/bench/profile.mts resolver
```

To compare two saved engine files, pass their paths and the result path:

```sh
node scripts/repo/bench/compiler.mts before.cjs after.cjs compiler.json
```

To inspect V8 compiler output, run:

```sh
node --trace-opt --trace-deopt --print-bytecode --print-bytecode-filter=Resolver --print-opt-code --print-opt-code-filter=Resolver scripts/repo/bench/profile.mts first > v8.log 2>&1
```

Open `.cpuprofile` files in Chrome DevTools to inspect which functions called each other.
The [V8 profiling guide](https://v8.dev/docs/profile) explains the tools.
Run timing experiments separately from tests and other CPU work.
The timing runners now use `mitata`; the historical measurements on this page predate that migration.

## What changed after this study

A later update saved snapshots of native tag and class collections.
A **snapshot** is a saved list of elements from a collection.
Simple queries return a fresh copy of that list.
More complex queries still test their attributes and relationships.

Before reusing a snapshot, the engine checks for document changes that could make the list outdated.
Weak references allow unused state to be collected.
Observer cleanup prevents discarded engines from keeping candidate arrays alive.

See the [snapshot design and memory checks](query-fast-paths.md#native-collection-snapshots).
The profile table above describes commit `6d79033`; it was collected before the snapshot update.

## Cold first-match class queries

A fresh `jsdom` class collection can scan its whole subtree and create objects for class names.
Reading only the first item can therefore process thousands of elements.
That collection setup was the main cost for the affected simple class queries.

The engine now checks at most 16 elements before requesting the full collection.
It saves class candidates from that initial group, called a **prefix**.
Before reuse, a mutation observer checks for pending document changes.
Tag checks and compiled conditions still run on each call.
Late matches and missing matches use the existing collection search.
Quirks mode, which follows older HTML compatibility rules, keeps the existing class lookup.

The implementation combines a limited candidate cache with a fast reuse path.
It avoids the full cold class scan and repeated document setup checks.
The [warm-cache follow-up](#warm-candidate-cache-follow-up) describes the later reuse improvement.

| Query                    | Earlier cold NWSAPI (ms) | Updated cold NWSAPI (ms) | Competitor (ms) | Cold speedup |
| ------------------------ | -----------------------: | -----------------------: | --------------: | -----------: |
| `.card`                  |                    1.897 |                    0.096 |           1.151 |        12.0× |
| `button.primary`         |                    1.809 |                    0.093 |           1.154 |        12.4× |
| `input.input`            |                    1.779 |                    0.093 |           1.152 |        12.4× |
| `.card > button.primary` |                    2.090 |                    0.170 |           1.143 |         6.7× |

The updated run recorded lower medians for all 12 cold queries and all 12 warm queries.
It used the same test HTML, nine passes, and separate documents for each engine.
See the [raw samples](../../../assets/repo/bench/first-query-states.json).
The earlier and updated builds were measured in separate runs, so small differences can include timing variation.

The focused V8 profile prepared 40 separate documents before sampling.
It recorded 666 samples before the change and 119 after it.
The earlier profile included 78 samples in class-name parsing and 50 in `DOMTokenList` setup.
The updated profile included 37 in selector parsing, 14 in collection planning, and 11 in the prefix helper.
These counts help locate work; use the timing results to compare speed.

The optimization trace showed that V8 assumptions about object layouts and called functions changed across documents.
The query entry point and first-match dispatcher later reached TurboFan.
The prefix helper reached Maglev.
TurboFan and Maglev are V8 compilers that optimize running JavaScript.
The change reduces DOM work across these compilation stages.

To reproduce the profiles, run:

```sh
node scripts/repo/bench/cold-first-profile.mts
node --trace-opt --trace-deopt scripts/repo/bench/profile.mts first
pnpm run compile -- --mode match ".card > button.primary"
```

Profile files use an operating-system temporary directory by default.
See [V8 profiling guidance](https://v8.dev/docs/profile) for the sampling method.

## Warm candidate-cache follow-up

The follow-up reduced query time by 24–45% for four early class queries compared with the build before the cold fix.
The first cold fix checked `ownerDocument`, `defaultView`, observer support, and a document weak reference on each query.
The warm profile showed repeated work in the `jsdom` code behind those property reads.

The prefix cache depends on descendant order and class text.
The engine checks that cache before reading document properties.
It reads those properties when it needs to create the observer.
Each reuse still calls `takeRecords()` to check pending changes.
Tag checks and compiled conditions run on the current elements.
The observer holds the cache through a weak reference.

Moving an element to another document can change the document's matching rules.
Simple and compiled first-match paths check for that move and refresh the rules when needed.
Queries against the current document use an identity comparison.
Queries scoped to an element check its current owner document.
Tests cover standards mode, quirks mode, XML adoption, SVG class changes, and changes after a move.

The focused comparison used separate documents and nine passes with a changing engine order.
Each sample contained 100,000 calls, and each call checked the returned element.
The baseline files came from `af47516`, before the cold fix, and `4ecb066`, with the cold fix.
Node.js removed TypeScript types from those source files before use.
See the [complete samples](../../../assets/repo/bench/first-cache-results.json).

| Query                    | Before cold fix (μs) | Cold fix (μs) | Updated (μs) | Change from original |
| ------------------------ | -------------------: | ------------: | -----------: | -------------------: |
| `.card`                  |                0.269 |         0.300 |        0.148 |        45% less time |
| `button.primary`         |                0.340 |         0.359 |        0.199 |        42% less time |
| `input.input`            |                0.341 |         0.350 |        0.189 |        45% less time |
| `.card > button.primary` |                0.417 |         0.455 |        0.316 |        24% less time |

The cold-query improvements remained in the updated build.
The focused profile recorded 5,487 samples before the warm change and 3,376 after it for one million calls.
Those samples locate work; they are separate from the timing measurements.
The trace showed the helper reaching TurboFan, then deoptimizing and recompiling after object-layout changes.
Fewer property reads produced the measured improvement.

The refreshed chart still recorded lower medians for all 12 cold queries and all 12 warm queries.
These results describe first matches on the component test page.

Run the focused tools with saved CommonJS engine files:

```sh
node scripts/repo/bench/profile.mts first-class
node --trace-opt --trace-deopt scripts/repo/bench/profile.mts first-class
node scripts/repo/bench/first-cache.mts before-cold.cjs cold-fix.cjs
```

The benchmark uses an operating-system temporary directory if you omit the output argument.

## What to measure next

Further comparisons should cover frequent document changes, other DOM implementations, missing results, and the cost of selecting a resolver.

For each optimization, test short and long searches.
Include many candidates under one parent and a few candidates spread across parents.
Check early matches, late matches, and no matches.
Also check document changes and different query scopes.
Compare results with an independent implementation.

Use complete-query measurements before adding a new parser, syntax-tree format, or cache design.
The current profiles do not establish a benefit for those larger changes.
