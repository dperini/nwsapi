# Performance

NWSAPI compiles CSS selectors into JavaScript functions. It saves these functions so later queries can reuse them. A function that checks whether an element matches a selector is called a **resolver**.

For a first-match query, the engine stops when it finds the required element. It does not collect every match. For a query that returns all matches, the engine shares position information across elements to avoid repeated work.

This guide explains an earlier performance study of engine commit `6d79033`. That study used Node.js 26.5.0, V8 14.6.202.34-node.24, jsdom 30.0.1, and an Apple M3 Max. V8 is the JavaScript engine used by Node.js and Chromium. See the [benchmark report](benchmarks.md) for the latest recorded comparisons. These results do not predict performance for every selector or application.

## How we measured performance

The [first-match results](../assets/repo/bench/first-match-results.json) compare a saved NWSAPI build, an updated build, and jsdom's default `@asamuzakjp/dom-selector` 8.3.2 engine. Each query checks that the results contain the correct elements before timing starts. Separate browser tests compare representative selectors with Chromium.

The measurements call NWSAPI directly. They call the other engine through jsdom's public methods. Those jsdom calls include integration work, so the comparison includes more than selector matching alone.

A **warm query** reuses work from earlier calls. A **cold query** uses a new selector and must compile it. A **candidate** is an element that the engine may need to test.

A CPU profile records samples of where the program spends time. We start the profile after creating the test document and preparing candidates. We stop it before closing the document. Cold compilation skips the warmup step and uses different selector suffixes to prevent reuse.

Each phase runs separately:

- The first-match, all-results, and raw-resolver phases run the selector matrix 1,000 times. The matrix contains 36 queries.
- The single-element matching phase runs 100,000 times and changes the element under test.
- The cold-compilation phase makes 36,000 compile requests.

The raw-resolver phase passes every element to the matching function. This measures the function separately from candidate selection. It does not represent the cost of a normal public query.

## What the profiles showed

The [profile data](../assets/repo/bench/v8-analysis.json) records source hashes, sample counts, and environment details. A source hash identifies the exact file that was measured.

The percentages below describe samples taken while a function itself was running. They exclude samples from functions it called. They are estimates, not exact elapsed times. Do not add percentages from separate phases.

| Phase                  | Samples | Main observations                                                                                                         |
| ---------------------- | ------: | ------------------------------------------------------------------------------------------------------------------------- |
| Cold compilation       |     471 | `compile` used 79.6% of samples. `compileSelector` used 8.9%. Garbage collection used 3.0%.                               |
| All-results selection  |   6,560 | `byTag` used 11.0%. Attribute lookup used 7.8%. The public selection function used 6.9%. Resolvers used 6.6%.             |
| First match            |   1,097 | Query-plan execution used 18.4%. Attribute lookup used 15.1%. Collection property checks used 14.8%. Resolvers used 8.4%. |
| Single-element match   |   1,216 | Resolvers used 18.9%. Cache lookups used 18.4%. The code that chose the matching function used 6.7%.                      |
| Raw resolver execution |   9,930 | Resolvers used 18.3%. `localName` reads used 9.5%. Ancestor filters used 9.4%.                                            |

Garbage collection releases memory that the program no longer needs. Ancestor filters help the engine skip elements whose parents cannot satisfy a selector.

The first-match profile includes queries with no result. Those queries can inspect many candidates. The profile therefore does not describe only queries that match the first candidate.

The `compile` samples include time spent creating JavaScript functions. They do not show that reading selector text caused all of that cost.

## How the compiler reduces repeated work

NWSAPI creates resolver functions with `Function()` and saves them in a cache. The first-match plan reuses the existing parser and compiler. A **query plan** contains the steps and functions needed to run a query.

The plan cache stores selector information and functions. It does not store matching elements or DOM collections. The cache has a size limit. The engine clears it when configuration or document rules change.

The engine compiles every selector group before it tests candidates. This makes sure an invalid group still produces an error, even if an earlier group could match. The engine then finds the first match in each group and selects the earliest element in document order. It calls the user's callback once, after choosing the result.

Tests cover XML documents, document fragments, legacy hosts, DOM changes, and callbacks that run another query.

### Stop early when the first candidate matches

The common path reads collection index zero without copying the collection or reading its length. If that element does not match, the engine checks the next seven entries. It then reads the length before a longer search.

This helps in jsdom because collection access can run extra code to manage DOM objects. Reading the length before the longer search also prevents unlimited reads beyond the collection's end.

### Count only the siblings that are needed

When testing one element against an `:nth-child()` formula, the resolver counts preceding siblings. For `:nth-last-child()`, it counts following siblings.

When selecting many elements, the engine keeps a shared sibling index. Building that index once can cost less than counting the same siblings for each candidate. Selectors with a fixed position keep their existing limited searches.

### Check the code that V8 produces

The first-match trace recorded seven completed resolver optimizations and no resolver deoptimizations. An optimization lets V8 replace general code with faster code. A deoptimization occurs when V8 must stop using that optimized code.

We inspected V8 bytecode and optimized ARM64 machine code. We checked array bounds, helper calls, and property reads. These findings apply to that recorded run. Other DOM implementations, selectors, or V8 versions can produce different results.

## Which changes we kept

| Experiment                                              | Decision                                                                                                                                                                                                                                              |
| ------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Compile first-match plans.                              | We kept this change. Warm calls reuse parsing and planning work, and the engine does not collect every result.                                                                                                                                        |
| Count siblings in the required direction.               | We kept this change for single-element matching. It skips siblings that cannot affect the answer.                                                                                                                                                     |
| Use `charCodeAt()` in three selector scans.             | We kept this change as a project preference. Comments show the character represented by each number. The corrected cold-query comparison ranged from about equal performance to a 6% improvement. This does not prove that all queries became faster. |
| Copy collection entries by index.                       | We kept this change in a later update for dense tag collections. The engine allocates the result array at the required size. The earlier experiment did not show a consistent improvement across complete queries.                                    |
| Pass live collections to all-results resolvers.         | We rejected this change. Many common filtered queries became about 20–30% slower in the exploratory run. Arrays without empty slots remained useful for resolver execution.                                                                           |
| Reuse progress through adjacent siblings.               | We revised and kept this change for forward `an+b` position formulas. It uses the existing helper when candidates are far apart. Callbacks, reverse searches, and legacy paths keep their existing helpers.                                           |
| Call collection `item()` while finding the first match. | We rejected this change. The method call cost more than the length read it avoided. A limited search by index performed better.                                                                                                                       |

The compiler also uses numeric ASCII checks to choose how to process a token. A **token** is a part of a selector, such as a name or operator. Namespace and extension handling still use their existing paths.

The parser study examined numeric character checks, combined whitespace scans, and reusable state. These techniques help when they remove repeated work. NWSAPI already reads each UTF-16 code unit once per scan. We did not replace complete DOM string comparisons with manual character loops.

[V8's scanner article](https://v8.dev/blog/scanner) explains how a compiler can handle common ASCII characters quickly and delay more complex Unicode work. It does not show that `charCodeAt()` is always faster than a JavaScript string comparison.

An early cold-query experiment allowed the second engine to reuse functions that V8 had compiled for the first engine. This overstated the improvement. The corrected runner uses different selector suffixes for each engine and changes the execution order between rounds.

An early CPU profile also included document setup and cleanup. We excluded those samples from the phase analysis. The rejected experiments help explain decisions; they are not performance promises.

## Run the tools

Install the development dependencies, then build the JavaScript files. Use Node.js 26 for these commands. The compiler CLI is a repository tool. It does not add a runtime dependency or an executable to the published package.

```sh
pnpm run build
bin/nwsapi compile '.card > button.primary'
bin/nwsapi compile --mode match --json 'div:nth-child(2n)'
bin/nwsapi compile --mode item --legacy '.card'
```

The CLI prints the generated resolver, its size in bytes, and the helpers it uses. The resolver can refer to `s`, which holds engine state, and `a`, which holds ancestor-filter information. It still needs the engine's validation, document handling, and candidate selection. It is not a complete standalone `querySelectorAll()` implementation. `compile()` can return `null` when no matching function is needed.

Run each profile separately. If you omit the output path, the tool creates a file in a unique temporary directory and prints its location.

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

To inspect V8's compiler output, run:

```sh
node --trace-opt --trace-deopt --print-bytecode --print-bytecode-filter=Resolver --print-opt-code --print-opt-code-filter=Resolver scripts/repo/bench/profile.mts first > v8.log 2>&1
```

Open `.cpuprofile` files in Chrome DevTools to see which functions called each other. The [V8 profiling guide](https://v8.dev/docs/profile) explains the profiling tools. Do not run timing experiments at the same time as tests or other work that uses much CPU time.

## What changed after this study

A later update saved snapshots of native tag and class collections. A **snapshot** is a saved list of elements that belonged to a collection at a given time. Simple queries copy these lists. More complex queries still test attributes and relationships.

Before using a snapshot, the engine checks for DOM changes that could make it stale. It uses weak references and cleans up mutation observers so discarded engines do not keep candidate arrays alive. A weak reference does not prevent garbage collection.

See the [snapshot design and memory checks](common-query-fast-paths.md#native-collection-snapshots) and the [benchmark report](benchmarks.md). The profile table in this guide still describes commit `6d79033`. It is not a new profile of the later snapshot update.

## What to measure next

The benchmark set does not cover every selector or application. Further work should measure cold queries, frequent DOM changes, other DOM implementations, missing results, and the cost of choosing a resolver.

For each new optimization, check short and long searches. Check dense and sparse candidates. Check early matches, late matches, and no matches. Also check DOM changes and different query contexts. Compare results with an independent implementation.

These profiles do not justify a complete parser rewrite, a new syntax-tree format, cached query results, or converting every string to a number. Add that complexity only when measurements show a useful improvement.

## Cold first-match class queries

A fresh jsdom class collection walks the subtree and creates class-token objects. Reading its first item can therefore process thousands of elements. The first-match compiler was not the main cost for simple class queries.

The engine now checks a prefix of at most 16 elements before it requests the full collection. It caches class candidates from that prefix. A mutation observer checks pending changes synchronously before each reuse. Tag checks and compiled conditions still run on every call. Late and missing matches use the existing collection path. Quirks mode keeps the existing class lookup.

The initial experiment walked this prefix on every query. It removed the cold losses but slowed warm class queries to 0.87–1.96 μs. The candidate cache reduced those times to 0.40–0.54 μs, with a modest warm cost compared with the earlier 0.35–0.50 μs results. The gain is lower cold cost, not a claim that every warm operation improved.

| Query                    | Earlier cold NWSAPI (ms) | Updated cold NWSAPI (ms) | Competitor (ms) | Cold speedup |
| ------------------------ | -----------------------: | -----------------------: | --------------: | -----------: |
| `.card`                  |                    1.897 |                    0.096 |           1.151 |        12.0× |
| `button.primary`         |                    1.809 |                    0.093 |           1.154 |        12.4× |
| `input.input`            |                    1.779 |                    0.093 |           1.152 |        12.4× |
| `.card > button.primary` |                    2.090 |                    0.170 |           1.143 |         6.7× |

The new run has lower medians for all 12 warm queries and all 12 cold queries. It uses the same fixture, nine rounds, and separate documents for each engine. See the [raw samples](../assets/repo/bench/first-query-states.json). Earlier and updated measurements came from separate runs, so small differences can include timing noise.

A separate interleaved comparison with the previous build checked warm queries, including empty results. The new early class path added about 0.04–0.08 μs per query in that run. The missing-class query increased from 0.38 to 0.58 μs. The absent ancestor query changed from 86.8 to 89.8 μs. Both empty-result queries remained faster than the competitor. This is the measured cost of checking the prefix before the fallback.

The focused V8 profile prepares 40 separate documents before sampling. Before the change it recorded 666 samples; after the change it recorded 119. The earlier profile had 78 samples in jsdom class-token parsing and 50 in DOMTokenList setup. The updated profile had 37 in selector parsing, 14 in collection planning, and 11 in the prefix helper. Sampling counts are diagnostic evidence, not benchmark timings.

The optimization trace showed early map and call-target deoptimizations across document realms. The query entry point and compiled first-match dispatcher later reached TurboFan. The prefix helper reached Maglev. This does not establish that all deoptimizations are avoidable. The retained change reduces DOM work instead of depending on a particular V8 tier.

Reproduce the profiles with these commands. Profile files use an operating-system temporary directory by default.

```sh
node scripts/repo/bench/cold-first-profile.mts
node --trace-opt --trace-deopt scripts/repo/bench/profile.mts first
node bin/nwsapi compile --mode match ".card > button.primary"
```

See [V8 profiling guidance](https://v8.dev/docs/profile) for the sampling approach.

## Warm candidate-cache follow-up

The follow-up removes the warm cost for the four early class queries. The first cold fix checked `ownerDocument`, `defaultView`, observer availability, and a document weak reference on every query. The warm profile showed substantial time in jsdom property wrappers.

A cached prefix depends on descendant order and class text. It does not depend on the owner document. The engine now checks for that cache first. It reads document properties only when it must create the observer. Every reuse still checks `takeRecords()`. Tag checks and compiled selector conditions remain live. The observer still holds the cache weakly.

Moving the same element context to another document also needs a document-mode refresh. The simple and compiled first-match paths now detect that change. Queries against the current document use an identity comparison. Element contexts check their current owner document. Regression tests cover standards mode, quirks mode, XML adoption, SVG class changes, and mutations after adoption.

The focused comparison uses separate documents, nine rotating rounds, and 100,000 calls per sample. Each call checks element identity. The baselines are source snapshots from `af47516` (before the cold fix) and `4ecb066` (the cold fix), with types stripped by Node.js. See the [complete samples](../assets/repo/bench/first-cache-results.json).

| Query                    | Before cold fix (μs) | Cold fix (μs) | Updated (μs) | Change from original |
| ------------------------ | -------------------: | ------------: | -----------: | -------------------: |
| `.card`                  |                0.269 |         0.300 |        0.148 |        45% less time |
| `button.primary`         |                0.340 |         0.359 |        0.199 |        42% less time |
| `input.input`            |                0.341 |         0.350 |        0.189 |        45% less time |
| `.card > button.primary` |                0.417 |         0.455 |        0.316 |        24% less time |
| `.missing`               |                0.339 |         0.537 |        0.370 |         9% more time |

The four early class queries take 24–45% less time than the original build. The missing-class control still takes about 31 ns more than the original build. It takes about 167 ns less than the first cold fix. The change therefore removes the early-match penalty without claiming that every fallback is faster than the original.

The focused profile recorded 5,487 samples before this change and 3,376 after it, for the same one million measured calls. These samples locate work; they are not timing measurements. The optimization trace showed the helper reaching TurboFan, with map-related deoptimization and recompilation. The measured gain comes from fewer property reads, not a promise of permanent optimization.

The refreshed chart comparison still has lower medians for all 12 warm queries and all 12 cold queries. These are first matches on the component fixture, not a claim about every selector or workload.

Run the focused tools with saved CommonJS engine snapshots. The benchmark writes to an operating-system temporary directory if the output argument is omitted.

```sh
node scripts/repo/bench/profile.mts first-class
node --trace-opt --trace-deopt scripts/repo/bench/profile.mts first-class
node scripts/repo/bench/first-cache.mts before-cold.cjs cold-fix.cjs
```
