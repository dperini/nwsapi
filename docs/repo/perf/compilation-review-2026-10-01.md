# Compilation and memory review — 2026-10-01

Reviewed local `v3` at `f04f47f8bb8cc4a86df33c41c141ace83d5ca963`. The strongest opportunities are avoiding quadratic positional work in `first()`, preparing nested logical predicates once, bounding two overlooked memo tables, and avoiding tree inspection for selectors that cannot use the inspected route. These deserve attention before a parser rewrite or broad additional caching.

This review records the original engine behavior. Its four high-priority findings now have implementations and a [measured follow-up](journal.md#prepare-forgiving-predicates-and-reuse-first-match-positions). Additional completed work is listed in the implementation status below. [Recorded evidence](../../../assets/repo/bench/compilation-review-2026-10-01.json) includes probe outputs, generated functions, timing samples, source hashes, dependency lock data, and the complete diagnostic harness. The probes used Node.js v26.10.0, V8 14.6.202.34-node.34, `jsdom` v30.0.1, and an Apple M1 Max. They loaded the reviewed TypeScript modules directly using the existing loader and factory initialization sequence. They did not measure the bundled release, Chromium, a full application, or retained heap bytes.

**How compilation works today**

Implementation status: a [second batch](journal.md#reuse-private-candidates-and-deterministic-code-factories)
now borrows private candidate snapshots, caches successful chain syntax, prepares
`closest()` walks, localizes resolver identifiers and class constants, and reuses
bounded unbound factories for engines that switch documents. The numbered findings
below preserve the original audit observations. Standalone build-time output,
early probing for general `:has()`, and broader compiler representations remain
proposals.

The [v2 compiler port](journal.md#port-the-v2-compiler-work-to-v3) subsequently
adds conservative pure-selector analysis, shared scans, inline relative and
logical paths, mixed-path memoization, sparse descendant witness inversion, and
estimated source-byte budgets. It records warm-query gains alongside cold
compilation and bundle-size costs. The original findings below remain a record
of the reviewed revision.

The public selection path validates and normalizes selector text, separates groups, chooses terminal tag/class/ID candidates, strips the candidate token when safe, and generates nested JavaScript conditions. Wrapping the previously generated continuation makes matching proceed from the candidate back through its relationships. The compiler delays type guards so they run before the other tests in a compound.

[The resolver builder](../../../src/core/compile/resolver.mts#L9) puts that source into array, `item()`, or single-element execution macros and calls `Function('s', 'a', ...)`. The returned resolver closes over `Snapshot` and optional ancestor-filter feedback. Selection can cache `null` when candidate acquisition already answers the selector. Cache keys distinguish mode, callback presence, relative matching, and existence-only matching.

[Two-generation caches](../../../src/core/cache/plan.mts#L3) retain generated functions separately from public query plans. Public plans contain factories and lookup tokens rather than result elements. First-match plans usually call a single-element resolver repeatedly and stop at the first success. Relative `:has()` plans are built lazily. Collection snapshots use weak ownership and mutation observation. Positional and ancestor summaries generally have query-local cleanup.

There are three different meanings of compiled work here:

| Usage | Work still performed |
| --- | --- |
| Warm `select()`, `first()`, `match()` | Public dispatch, relevant scope checks, plan lookup, candidate acquisition where applicable, matching, and result assembly. |
| A saved `compile()` resolver | Candidate iteration and matching. Some nested selectors still perform cache lookup or lazy compilation. Caller supplies the correct candidates, context, and result arguments. |
| Build-time precompilation | No complete self-contained deployment format exists in this tree. The inspection CLI prints resolver source that can refer to captured `s` and `a`. It does not emit a complete query plan or recursively prepared dependencies. |

**Prioritized findings**

| Priority | Opportunity | Evidence | Primary benefit |
| --- | --- | --- | --- |
| High | Give `first()` a positional strategy for scanning many candidates | Reproduced quadratic sibling-read growth | Late-match and no-match latency |
| High | Compile forgiving logical branches once | Repeated parsing/errors reproduced; diagnostic timing improvement | Warm execution, allocation, predictable precompilation |
| High | Bound ancestor-tag and language-range memo tables | Tag growth reproduced; language reuse survives engine replacement | Long-lived process memory |
| High | Check route syntax before inspecting foreign element types | Full-tree reads reproduced for `.card` after mutation | Cold and mutation-followed query latency |
| Medium | Separate internal candidates from public result copies | Source-confirmed copies; `:has()` read count reproduced | Allocation and early-exit effectiveness |
| Medium | Cache successful chain syntax and `closest()` preparation | Repeated parsing reproduced | Warm public API overhead |
| Medium | Make compiler constants and generated identifiers local to a compilation | Generated source inspected | Compilation reuse and resolver allocation |
| Medium, architectural | Separate reusable code artifacts from bound engines and nested execution state | Lazy compilation and document-switch churn reproduced | Precompilation, document-heavy workloads |
| Conditional | Improve fallback sibling indexes, type-union merging, and state helpers | Source inspection and historical profiles | Specific broad/deep workloads |

**1. `first()` can turn a linear sibling query into quadratic work.**

[First-match execution](../../../src/core/first/select.mts#L47) compiles in single-element mode, then invokes the matcher separately for each candidate. [The positional matcher](../../../src/core/compile/position/match.mts#L32) counts preceding siblings from scratch. The all-results compiler already has an ordered-position strategy, but this first-match path cannot reuse that progress.

For `i[data-hit]:nth-child(2n)` with no matching attributes:

| Siblings | `first()` sibling reads | `select()` sibling reads |
| ---: | ---: | ---: |
| 128 | 8,256 | 129 |
| 256 | 32,896 | 257 |
| 512 | 131,328 | 513 |

These counts include `previousSibling` and `previousElementSibling` getters. Both operations returned no match. They establish repeated traversal, not an elapsed-time speedup. The emitted positional test runs before the attribute test for this selector, making the missing attribute unable to avoid the recount.

Recommended change: introduce a first-result collection resolver, or pass invocation-local positional progress through the first-match scan. Preserve the current cheap scalar path for one-element `match()` and early successes. An adaptive switch after the bounded initial probe can avoid paying index setup for the common first-candidate hit. Audit dense, sparse, reverse, of-type, and filtered formulas separately. Predicate reordering may also help, but needs getter, extension, and reentry checks.

**2. General logical predicates are still interpreted through selector strings inside compiled loops.**

The fallback for [forgiving `:is()` and `:where()`](../../../src/core/compile/pseudo/logical.mts#L127) emits an array literal and `s.matchForgiving(...)` inside the candidate loop. [That helper](../../../src/core/match/selector.mts#L90) calls the general matching API on each branch and catches failures. Valid branches pay key construction, cache lookup, and dispatch. Invalid branches that throw never reach the successful resolver-cache insertion.

In a warm query for `div:is(.missing,:audit-unknown)` over 256 `div` elements, one call repeated `parse()` 256 times, `compileSelector()` 256 times, and error emission 256 times. All errors were swallowed by the forgiving helper and the answer was empty. The outer query plan being cached does not prevent this work.

A separate valid-selector experiment replaced only `Snapshot.matchForgiving` with a closure holding two already-compiled branch functions. For `div:is(.missing,[data-hit])` over 256 fixed candidates, nine alternating rounds of 1,000 raw-resolver calls gave median times of **0.1212ms currently versus 0.0456ms with prebound branches**, about **2.66× faster**. Samples ranged from 0.1206–0.1217ms and 0.0452–0.0460ms respectively. All 256 result identities were checked before timing. The outer array literal was unchanged.

This is a diagnostic substitution, not a general implementation or public-query result. It establishes that eliminating repeated logical dispatch is worth a proper candidate. It does not quantify allocation savings or browser performance.

Recommended change: prepare each forgiving branch once, represent invalid branches as a nonmatching entry, and bind the valid predicates directly. Store constants outside the candidate loop. Include `FORGIVING`, `VERBOSITY`, document semantics, and extension registration in invalidation. In particular, an initially unsupported pseudo can become supported after registration, so permanently remembering failure without an extension generation would be wrong. Extend preparation to complex `:not()`, `:matches()`, relative plans, and filtered nth dependencies without indiscriminate source inlining.

**3. Two memo tables escape the bounded-cache policy.**

[`tagBits`](../../../src/core/ancestor/mask.mts#L3) records every encountered tag string in an engine-owned object. Its values are deterministic 32-bit masks, but its string key count is unbounded. Compiling 10,000 selectors of the form `x-audit-N section span` left **10,001 tag keys**, while the bounded selection-lambda cache held 3,856 entries. `configure({}, true)` cleared the lambdas but left all 10,001 tag keys.

[`wantedRanges`](../../../src/core/match/language/match.mts#L7) is a module-level object holding lowercased, split language ranges. It has no limit or clearing path and survives individual engine lifetimes. A probe populated 1,000 distinct `:lang(x-audit-N)` ranges. Replaying after a cache clear, then checking one range from a new engine, performed no additional range splits. This corroborates the lifetime visible in source. There is no retained-byte measurement here, and neither finding implies retention of DOM nodes.

Recommended change: bound the tag memo independently of the tag-to-bit mapping, or compute hashes without remembering uncommon names. Eviction is safe only if the hash assignment remains deterministic. Move language-range tokens into compiled constants or use a bounded module cache. Prioritize these concrete growth paths before tuning already bounded plan caches.

**4. Route discovery performs whole-tree work before determining whether the selector can use that route.**

[`selectByDescent()`](../../../src/core/select/all.mts#L79) calls `hasForeignTypes(context)` before either chain grammar check, and before the ordinary cached-plan path. [The foreign-type helper](../../../src/core/lookup/tag.mts#L132) can scan the complete root after a child mutation. This applies even to `.card`, which cannot match either chain grammar and whose class lookup does not require this scan.

After warming `.card` over 1,000 matching elements, an unchanged repeat read `localName` zero times. Appending an unrelated `aside` made the next repeat read it **1,005 times**. Bypassing only this foreign-type helper on the all-HTML diagnostic fixture returned identical elements with zero such reads.

Recommended change: reject ineligible selector shapes and contexts before querying foreign-type state. Cache immutable route classification with the plan. Keep the foreign-type guard where it protects actual tag/namespace-sensitive optimizations. Do not disable it globally. The same ordering review applies to the direct-child shortcut, whose inexpensive `>` test still admits many selectors its actual grammar rejects.

**5. Candidate copies reduce the value of compilation and early termination.**

[`collectionCopy()`](../../../src/core/collection/copy.mts#L3) returns `snapshot.slice()` on snapshot hits. The ordinary [tag](../../../src/core/lookup/tag.mts#L247) and [class](../../../src/core/lookup/class.mts#L5) acquisition paths use it even when a resolver will immediately filter those candidates into a separate result array. Returning a fresh array is necessary when the candidate list itself is the public result. A private, immutable candidate snapshot need not automatically require another copy.

Recommended experiment: introduce an internal acquisition path that borrows an existing snapshot when a non-null resolver consumes it. Preserve fresh public arrays and the existing snapshot boundary. This differs from passing a live `HTMLCollection` through every resolver, an approach that earlier repository experiments rejected. Check candidate mutation by extensions, result aliasing, callbacks, nested queries, and detached-node collection.

[General `:has()`](../../../src/core/match/relative.mts#L7) already borrows cached snapshots, but on misses it still materializes candidates before its existence resolver can stop. With snapshots deliberately disabled, `:has([data-hit])` over 1,000 children read all 1,000 collection entries even when the first child matched. Existence execution also appends a matched element to an array merely to check `.length`.

Recommended experiment: a bounded first-candidate probe or specialized boolean path for eligible selectors, followed by the existing copied path where needed. A boolean return removes the result-array requirement. Streaming a live collection across arbitrary predicates changes observable behavior and must not be a blanket replacement. Snapshot hits, small collections, cold queries, and mutation-heavy queries need separate measurements.

**6. Some successful fast paths bypass plan caching and redo preparation.**

[`chainByParts()`](../../../src/core/select/all.mts#L110) remembers declines but reparses successful descendant and general-sibling chains. One hundred warm `article div span` queries called `parseChain()` 100 times. In addition, [`closest()`](../../../src/core/ancestor/closest.mts#L2) calls the parser before every ancestor walk, then performs string-based `match()` dispatch at each ancestor. One hundred warm `closest('section', node)` calls repeated parsing 100 times.

Recommended change: retain bounded, immutable chain descriptions and separate them from mutation-sensitive cost decisions. Prepare `closest()`'s validated matcher array once per call or cached plan, then reuse it through the walk. Preserve invalid-selector behavior for null inputs, scope semantics, callbacks, and nested document changes. Reconsider declined routes periodically or after relevant tree changes rather than making a permanent decision about an evolving document.

**7. Compiler state and constants have avoidable variation and repeated work.**

The compiler uses the engine-wide `notFlag` counter for generated negation and positional names. Compiling `div:not(.a)`, clearing caches, and compiling it again produced otherwise equivalent functions with `_n0` and `_n1`. A per-compilation allocator, shared only by nested expansions belonging to that function, would make output deterministic and avoid steadily growing identifiers. The effect on V8's own compilation reuse is unmeasured here. Do not reset the counter blindly during recursive compilation.

Class regexes already receive partial hoisting, but [nested logical calls](../../../src/core/compile/pseudo/logical.mts#L33) create fresh compiler ancestry rather than sharing a general constant pool. The inspected `div:not(.a)` resolver still embeds its regex literal inside the loop. [Attribute operators](../../../src/core/compile/attribute/condition.mts#L3) also emit regex literals for many comparisons. Hoist immutable, nonstateful regexes and logical lists where a measurement shows a benefit. Sharing regex objects requires preserving the assumptions about flags and user extensions. Source-level object creation is not automatically a measured heap allocation, because the runtime may optimize it.

The parsing pipeline also repeats comment removal, combinator normalization, logical validation, and token recognition across public parsing, validation-only compilation, and final compilation. A small prepared representation could carry normalized groups, candidate tokens, nested dependencies, helper requirements, and positional strategy into each execution mode. Start with the demonstrated repeated nested work. A full retained AST for every mode could increase memory without paying for itself.

**8. Precompilation needs a distinction between reusable code and bound query execution.**

Calling `compile('div:has([data-hit])', true)` generated one JavaScript function. Executing it on relevant candidates generated a second function for the nested relative plan. The argument had already undergone validation-only compilation. Therefore precompiling the outer selector neither completes all compilation nor guarantees a compilation-free first execution. Preparing dependencies explicitly would make latency easier to control, at the cost of eagerly building branches that may never execute.

A true build-time output should include candidate strategy, nested predicate factories, constant tables, helper dependencies, and a compatibility/version key. Emit a module or factory that accepts runtime state. The existing [inspection CLI](../../../scripts/repo/compile.mts#L6) prints a bound resolver's source and identifies `s` and `a`; it is not that artifact format. Build-time generation could avoid dynamic `Function()` for a fixed known selector set only if every dependency is included. Unknown runtime selectors would still need the existing compiler or a separately designed interpreter.

Current resolvers close over the full `Snapshot`, which contains document references and engine-bound helpers. A caller retaining a compiled function can consequently retain its engine and document. This is a lifetime consideration for a public precompiled-handle API, not proof of an accidental leak. Share unbound code factories or compact prepared selector data across engines rather than sharing those bound closures globally.

[`switchContext()`](../../../src/core/dom/context.mts#L3) clears compiler and plan caches whenever the document changes. Twenty alternating same-selector queries across two HTML documents invoked `compileSelector()` 20 times. A bounded reusable factory cache keyed by semantic compilation profile could help multi-document workloads. The key must account for HTML/XML, quirks, namespaces, legacy readers, host readers, configuration, and extensions. The `jsdom` adapter already uses one engine per document, so this particular cross-document churn does not apply to its normal ownership model.

Finally, `4096` is a per-cache entry limit, not a total engine memory or byte limit. Generated functions may also remain reachable from query plans after lambda-cache eviction. Long selectors and large groups can have very different footprints. Consider a shared code artifact with compact mode variants, smaller limits for bulky entries, or a source-size budget if churn measurements justify the extra accounting. Do not replace the current inexpensive cache with a heavier LRU without a representative comparison.

**Other targeted opportunities**

- [Fallback nth indexes](../../../src/core/compile/position/nth-element.mts#L50) search parent arrays and sometimes sibling arrays. [`nth-of-type`](../../../src/core/compile/position/nth-of-type.mts#L114) may rescan a parent's children for each encountered type and creates a new parent slot when a requested type has no stored list. A per-query parent record with type indexes could help mixed-type and interleaved-parent cases. Retain cheap sequential handling and legacy fallback. This review did not benchmark a replacement.
- [Sparse type unions](../../../src/core/lookup/tag.mts#L63) merge one additional tag collection into a growing result array. Many sparse alternatives can repeatedly copy and compare accumulated results. A balanced merge or a group-count threshold is worth testing. The existing dense-union broad-scan fallback already handles a different cost regime.
- [Grouped result merging](../../../src/core/collection/order.mts#L13) already uses balanced merging on cached queries. The existing journal attributes much of its sampled cost to host document-order access. Avoid proposing another generic sort replacement without new evidence.
- Language inheritance and disabled-fieldset checks repeatedly walk ancestors. Query-local inherited-state reuse is plausible, but property changes and nested execution matter. Historical state profiles, including native direction matching, are not current speedup claims. The adapter already has host-reader integration, so private host access is not a missing generic optimization.
- Tiered compilation for one-off selectors could reduce `Function()` and code-cache churn. It would require a second execution strategy and a threshold policy, while adding per-query dispatch. Defer it until high-cardinality selector workloads establish that compilation dominates enough to justify the complexity.

**What to preserve and how to evaluate changes**

Keep the existing identity-selection optimization, early first-candidate probes, bounded generational caches, class-read sharing, direct equality comparisons, adaptive ancestor filtering, weak snapshot ownership, and query cleanup. The earlier journal already rejects indiscriminate live-collection iteration. Several historical findings have since been addressed, including general relative-plan caching and stable wildcard snapshot identity. This report does not reopen those as missing features.

Implement the first four findings independently. Measure public APIs and raw resolvers separately. Include early, late, and absent matches; repeated and distinct selectors; cache turnover; document switching; class/child/unrelated-attribute mutation; fragments and shadow roots; HTML, XML, quirks, and legacy behavior; callbacks and nested queries. For changes that retain data, measure both allocation and post-cleanup reachability. Verify browser behavior and the relevant existing regression suites before claiming an improvement.

The isolated timing above is the only new elapsed-time comparison in this report. Getter and call counts identify concrete repeated work but are not speedup percentages. No implementation candidate, browser benchmark, full regression run, or heap-retention audit was performed.

**Reproducing the evidence**

The evidence JSON contains `harnessSources` for `load.mjs`, `probe.mjs`, `extra.mjs`, and `nth.mjs`, plus exact dependency lock data and commands under `reproduction`. Extract the scripts into `/private/tmp/nwsapi-compilation-audit`. Their source root is recorded in the JSON and can be replaced if the checkout is elsewhere. Run the three probe programs in order with the recorded `NODE_PATH`. They write temporary results and do not modify production source. Instrumentation and diagnostic helper substitutions are local to those processes.
