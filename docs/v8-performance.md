# V8 performance analysis

The retained change compiles reusable first-match plans and stops after the
first qualifying candidate in each selector group. It also specializes
single-element `:nth-child()` and `:nth-last-child()` formula matching so it
does not build a sibling index. All-results selection keeps its packed
candidate arrays and shared positional indexes.

This analysis covers engine commit `6d79033`, Node.js 26.5.0, V8
14.6.202.34-node.24, jsdom 30.0.1, and an Apple M3 Max. The engine is NWSAPI,
the successor to NWMATCHER. The measurements do not establish a speed limit
for either V8 or the engine, or a win on every possible selector.

## Measurements

The [first-match results](../assets/repo/bench/first-match-results.json)
compare the saved pre-change source, current source, and jsdom's default
`@asamuzakjp/dom-selector` 8.3.2 engine. The
[benchmark report](benchmarks.md) contains the current tables and all-results
comparison. Each timed selector checks result identity before measurement;
browser regression tests independently check representative forms against
Chromium. Direct NWSAPI calls and jsdom's public methods have different
integration overhead.

CPU profiles start after fixture creation, candidate preparation, and warmup,
and stop before window teardown. Cold compilation skips warmup and uses
unique selector suffixes. Each phase runs separately. The first, select, and
resolver phases run 1,000 iterations of the 36-query matrix; matching runs
100,000 iterations and varies the tested element. Cold compilation performs
36,000 top-level compile requests. The raw resolver phase intentionally
passes every element as a candidate: it isolates predicate execution and is
not an alternative measurement of the optimized public query plan.

The [profile summary and scanner samples](../assets/repo/bench/v8-analysis.json)
record source hashes, sample counts, and environment details. These are
sampled self-time shares, not exact elapsed-time accounting or percentages
that can be added across phases:

| Phase                  | Samples | Largest relevant observations                                                                       |
| ---------------------- | ------: | --------------------------------------------------------------------------------------------------- |
| Cold compilation       |     471 | `compile` 79.6%; `compileSelector` 8.9%; GC 3.0%                                                    |
| All-results selection  |   6,560 | `byTag` 11.0%; attribute lookup 7.8%; public selection 6.9%; resolvers 6.6%                         |
| First match            |   1,097 | plan execution 18.4%; attribute lookup 15.1%; collection property descriptors 14.8%; resolvers 8.4% |
| Single-element match   |   1,216 | resolvers 18.9%; cache `get` 18.4%; match dispatch 6.7%                                             |
| Raw resolver execution |   9,930 | resolvers 18.3%; `localName` reads 9.5%; ancestor masks 9.4%                                        |

The first-match aggregate includes queries that return no result and must
examine many candidates. Its profile should not be read as the cost breakdown
of a successful first-candidate hit. The cold `compile` frame includes time
spent creating dynamic functions; it does not establish that string scanning
accounts for that entire share.

## Generated code and V8

NWSAPI already generates JavaScript with `Function()` and caches compiled
resolvers. Adding compilation itself would not remove another interpreter.
The new first-match plan reuses the existing parser, candidate optimizer, and
matching compiler. It retains tokens and functions, never collections or
matched elements. Its bounded cache clears when configuration or document
semantics change.

Each selector group is compiled before candidates are examined, preserving
validation even when an earlier group would match. The plan finds the first
match per group and compares those nodes in document order. The user's
callback runs once, after choosing the result. XML, fragment, legacy,
mutation, and reentrant callback tests cover the surrounding behavior.

The common first-candidate hit reads index zero without copying the collection
or requesting its length. A short probe checks the next seven entries before
reading length for a longer scan. This matters in jsdom, where collection
operations involve proxy traps and host bookkeeping. A bounded longer scan
keeps absent and late matches from making unlimited out-of-range probes.

For formula matching against one element, generated code counts preceding
or following siblings directly. The selecting compiler keeps the index that
amortizes traversal across many candidates. Constant positional forms retain
their existing bounded walks.

A trace of the first-match workload captured seven completed TurboFan
resolver optimizations and zero resolver deoptimizations. Bytecode and ARM64
optimized-code output were inspected, including generated bounds checks,
helper calls, and property loads. This is evidence for that run, not a claim
that all resolver shapes optimize or never deoptimize. Different DOM classes,
accessor shapes, selector mixes, and V8 versions can change those decisions.

[Zod's compilation design](https://zod.dev/blog/introducing-z-compile) similarly
moves repeated interpretation into generated checks. Its error fallback is
useful inspiration, but selector syntax must be validated before candidate
short-circuiting. NWSAPI uses its established compiler for every group rather
than deferring invalid-selector handling until a match fails.

## Experiments retained and rejected

| Experiment                                              | Result and decision                                                                                                                                                                                                                                                                                                                   |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Compiled first-match plans                              | Retained. Avoids collecting every result and repeats neither parsing nor candidate planning on warm calls.                                                                                                                                                                                                                            |
| Directional positional matching                         | Retained for single-element matching. Avoids indexing siblings that cannot affect the requested position.                                                                                                                                                                                                                             |
| `charCodeAt()` in three structural scans                | Retained by project preference, with comments spelling out each character. The earlier controlled cold comparison ranged from roughly parity to 6% faster; this is not evidence of a broad query-speed improvement. Compiler token dispatch now also uses numeric ASCII classification, preserving the namespace and extension paths. |
| Indexed copying instead of `slice.call()`               | Retained in the subsequent common-case update: dense tag collections use a preallocated indexed copy. The earlier 36-query experiment did not establish a consistent end-to-end gain.                                                                                                                                                 |
| Live collections as all-results resolver inputs         | Not retained. Many common filtered queries regressed by roughly 20–30% in the exploratory run. Packed arrays remain valuable to resolver execution.                                                                                                                                                                                   |
| Adjacent-sibling arithmetic inside selecting resolvers  | Revised and retained for forward selecting an+b queries: bounded sibling progress falls back to the existing helper for sparse candidates. Callback, reverse, and legacy paths retain their existing helpers. Earlier unrestricted experiments regressed other positional cases.                                                      |
| Calling collection `item()` during first-match scanning | Not retained. Host method overhead overwhelmed the saved length read. Bounded indexed probing performed better.                                                                                                                                                                                                                       |

The parser comparison examined numeric token dispatch, ASCII classification,
fused whitespace scanning, and preparing reusable state. These ideas are
useful when they remove repeated work. NWSAPI's structural scanners already
read each code unit once per pass. Replacing whole DOM string equality with
manual character loops would be a different experiment and was not shipped.
[V8's scanner discussion](https://v8.dev/blog/scanner) explains the benefits
of ASCII fast paths and delaying Unicode work; it does not imply that every
JavaScript string comparison should become `charCodeAt()`.

An initial cold comparison accidentally let the second engine reuse V8's
compiled function source and overstated scanner gains. The corrected runner
uses engine-specific selector suffixes and rotates order. An initial CPU
profile included fixture setup and teardown; those samples were discarded
for the phase analysis above. The negative experiments are diagnostic runs,
not release performance guarantees.

## Reproduce and inspect

Install repository development dependencies and build first. These commands
use Node.js 26. The CLI is repository tooling and does not add a runtime
dependency or an installed npm executable to the selector engine.

```sh
pnpm run build
bin/nwsapi compile '.card > button.primary'
bin/nwsapi compile --mode match --json 'div:nth-child(2n)'
bin/nwsapi compile --mode item --legacy '.card'
node scripts/repo/bench/profile.mts select /tmp/select.cpuprofile
node scripts/repo/bench/profile.mts cold /tmp/cold.cpuprofile
node scripts/repo/bench/profile.mts first /tmp/first.cpuprofile
node scripts/repo/bench/profile.mts match /tmp/match.cpuprofile
node scripts/repo/bench/profile.mts resolver /tmp/resolver.cpuprofile
node scripts/repo/bench/compiler.mts /tmp/before.cjs /tmp/after.cjs /tmp/compiler.json
node --trace-opt --trace-deopt --print-bytecode --print-bytecode-filter=Resolver --print-opt-code --print-opt-code-filter=Resolver scripts/repo/bench/profile.mts first /tmp/traced.cpuprofile > /tmp/v8.log 2>&1
```

The compiler CLI prints the raw public `compile()` resolver, its byte length,
and referenced helpers. Its source closes over `s` (the engine snapshot) and,
when used, `a` (ancestor-filter feedback). It is not a standalone emitted
`querySelectorAll()` implementation: public validation, context management,
and candidate acquisition are separate. Selection can return a null resolver
when no predicate is needed. The existing `compile()` API remains unchanged.

Load `.cpuprofile` files in Chrome DevTools to inspect callers and callees.
[The V8 profiling guide](https://v8.dev/docs/profile) describes the broader
profiling workflow. Timing and tracing should run separately from tests and
other CPU-intensive tasks.

## Remaining performance work

The all-results report still contains losses and small margins; this change
does not establish dominance on every query type. The next bounded targets
are formula positions over many candidates, child relationships that do not
benefit from a selective anchor, expensive missing-result queries, and
matching dispatch/cache overhead. Further changes need the same dense/sparse,
early/late/missing, mutation, context, and independent-oracle checks.

A full parser rewrite, an AST intermediate representation, node-result
memoization, or global string-to-number conversion has not been justified by
these profiles. A future compiler representation should earn its complexity
by reducing measured compile cost or enabling a proven specialization.
