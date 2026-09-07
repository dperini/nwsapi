# Performance review — 2026-09-07

NWSAPI wins 30 of the 36 recorded warm-query comparisons against
`@asamuzakjp/dom-selector` 8.3.2. That is a strong starting point, but not yet
evidence of a general performance lead. The next work should eliminate the
largest traversal loss, improve positional and logical queries, and measure
the actual jsdom integration under changing documents. The acceptance bar is
decisive wins across every query category and API, not an aggregate majority.

## Acceptance bar

Use **at least 2× faster** as the proposed meaning of a decisive win. This
threshold is a planning target, not an achieved result or a measured forecast.
Apply it to every representative case in each category, not just a category
average. Only 15 of the current 36 cases clear that threshold.

The matrix must cover identifiers, attributes, relationships, positional,
logical/relational, and state selectors through all four APIs: all matches,
first match, element matching, and closest ancestor. Cross those with cold,
warm, and post-mutation execution; document and scoped contexts; and small,
wide, and deep fixtures. Add empty and high-cardinality results explicitly.

Require equivalent correct results, no hidden unsupported cases, and repeated
runs that distinguish the advantage from measurement noise. Also compare
startup, allocations, and retained memory so query speed is not bought with
unbounded lifecycle costs. Report any case below the target as outstanding.
Finite benchmarks cannot prove superiority for every possible selector and
DOM, but they can prevent a broad claim from hiding a losing query type.

## Evidence and scope

This is a review of committed measurements and source, not a new timing run.
The three `assets/repo/bench/**/results.json` files record engine source commit
`d051a7e`, which is still the engine source at reviewed master `2ddfba2`.
They used Node 26.5.0, jsdom 30.0.1, an Apple M3 Max, nine rounds of 100
iterations, and Chromium 151 as the correctness oracle. All 36 rows report
agreement for all three engines. See [the benchmark contract](benchmarks.md).

Upstream had no open PRs at review time. The earlier performance PRs
#182–189, #194, #200, and #204–208 have landed; their surviving local branches
are not an unmerged performance backlog. The only open issue was
[the 3.0 transition](https://github.com/dperini/nwsapi/issues/162).

The existing report compares direct NWSAPI `select()` with jsdom's public
`querySelectorAll()`. This is a useful comparison of those call paths, but
includes different wrapper and integration costs. It does not measure cold
compilation, mutation, first-match queries, matching, closest, scoped contexts,
browser execution, or comparative memory use. Its 30 wins include margins near
1%, which should be treated as ties until repeated runs establish separation.

## Measured gaps, in priority order

Times below are milliseconds per query from the committed report.

| Priority | Query                    |  NWSAPI | dom-selector | Assessment                 |
| -------- | ------------------------ | ------: | -----------: | -------------------------- |
| 1        | `div.example > p > a`    | 1.11820 |      0.14155 | NWSAPI takes 7.90× as long |
| 2        | `div:nth-last-child(3)`  | 0.16390 |      0.08035 | 2.04× as long              |
| 2        | `div:nth-child(2n)`      | 0.13904 |      0.08624 | 1.61× as long              |
| 3        | `:where(.card) > button` | 0.15388 |      0.12025 | 1.28× as long              |
| 4        | `div > button`           | 0.12548 |      0.11819 | 1.06× as long              |
| 4        | `div button`             | 0.12666 |      0.11999 | 1.06× as long              |

These are all six losing rows. Use the raw comparisons rather than chart
rounding. Addressing these losses is only the first milestone: the near-ties
and modest wins also need improvement to meet the 2× target.

### 1. Plan selective child and mixed chains

`reTagChain`, `parseChain()`, and `descendChain()` in `src/nwsapi.mts` only
route space-separated simple descendant chains. Child combinators in
`div.example > p > a` cannot use that route. This is a concrete missing
optimization; profiling must establish how much of the measured loss it explains.

Prototype a plan that seeds from the selective `div.example` portion and
checks the child relationships, with a cost budget and the existing resolver
as fallback. Compare against rightmost-candidate execution on deep, wide,
sparse, overlapping, and empty trees. Preserve document order, uniqueness,
context boundaries, callbacks, XML behavior, and immediate mutation visibility.
Do not simply replace all right-to-left matching with descending traversal.

Also address routing adaptation: `descentDeclined` remembers a rejected route
by selector until cache eviction or an explicit clear. `switchContext()` clears
`partCounts` but not that rejection cache. A query first used in an ineligible
context or an unfavorable tree can therefore miss later opportunities. This
affects performance rather than result correctness. Test alternating contexts
and changing tree shapes before choosing retry or context-scoped heuristics.

### 2. Make positional execution fit candidate density

`nthElement()` builds sibling arrays, searches a parent array, and sometimes
searches the sibling array again. Constant child positions already have a
bounded sibling-walk specialization; proposing that same optimization again
would not address the remaining `nth-last-child(3)` loss.

Profile dense and sparse candidate sets separately. Evaluate a query-local
parent/index structure for general formulas and parent-driven selection for
dense constant-position queries. Keep the existing bounded walk for sparse
candidates when it wins. Cover reverse positions, multiple parents, detached
trees, of-type forms, reentrancy, and sibling mutations. Avoid persistent DOM
indexes without a proven invalidation contract.

### 3. Compile simple logical predicates and improve candidate selection

The compiler already inlines tag-only `:is()`/`:where()` lists and compound
`:not()`. A class predicate such as `:where(.card)` still takes the general
matching path. Compile eligible simple compounds in place while preserving
forgiving-list parsing and compiler state. Measure both `select()` and `match()`.

For `.card > :is(button, input)` and `:is(button, input)`, explore choosing
candidates from the alternatives instead of scanning all elements. Include
deduplication, ordering, and collection-copy costs in the decision. These rows
already beat dom-selector, but remain relatively expensive in absolute time.

The direct-child tag form of `:has()` is also already specialized. General
`has()` still parses and collects relative selectors per anchor. Precompile
validated relative plans and investigate existence-only execution for classes,
attributes, and sibling forms. This is an unmeasured opportunity, not a current
claim of a competitor gap. Preserve anchor isolation and validation of the whole
argument list even when an earlier branch matches.

### 4. Protect form-state correctness while reducing repeated ancestry work

`input:enabled` and `input:read-write` beat or approximately tie dom-selector,
but take about 2.77× and 1.96× the 2.2.27 baseline time. The old baseline is not
a correctness target: disabled-fieldset handling and other behavior changed.
`isDisabled()` currently walks ancestors per control. Investigate query-local
sharing of fieldset ancestry information, with first-legend exceptions and
mutation/reentrancy coverage. Measure realistic disabled and nested fieldsets;
the recorded component fixture does not exercise those cases.

## How to establish a durable advantage

1. **Measure equivalent public integrations.** Run jsdom with its default
   engine and with the NWSAPI adapter in separate instances using identical
   fixtures and operations. Keep direct-engine measurements as a separate
   diagnostic. dom-selector advertises both standards compliance and adoption
   as jsdom's default engine in its [upstream README](https://github.com/asamuzaK/domSelector).
   Faster internals must translate into faster application calls.
2. **Add changing-document workloads.** Separate unchanged warm queries,
   first queries after DOM and property changes, and realistic mixed workloads.
   Include insert/remove/reparent, attributes, checked/selected/disabled state,
   and focus. Measure mutation plus query as well as query alone. Do not disable
   competitor caches for headline results; measure normal application behavior.
3. **Cover the operations users actually perform.** Add `querySelector`,
   `matches`, and `closest`, plus Element, DocumentFragment, and ShadowRoot
   contexts, absent matches, duplicate IDs, and early versus late matches.
   Import real selector traces from component-test workloads where available;
   label generated fixtures as synthetic.
4. **Measure lifecycle and bounded memory.** Compare construction, first query,
   many short-lived documents, high-cardinality selectors around cache limits,
   allocation, and retained memory after collection. Source size and minified
   size alone do not establish startup or memory advantages. Keep cached plans
   independent of DOM results and verify removed documents can be collected.
5. **Make regression evidence reproducible.** Retain version/source/fixture
   hashes and all samples. Add independent process repetitions, uncertainty
   estimates, and per-category summaries. Establish noise on a stable runner
   before enforcing performance thresholds. Gate each optimization on browser
   agreement and relevant mutation tests; report unsupported cases separately.

The recommended sequence is: extend the measurement contract, address the
selective child-chain loss, improve positional and logical execution, then
optimize adapter lifecycle and memory based on the new measurements. Run a
real jsdom/component-test workload before making a broad competitive claim.
The product promise to prove is fast, correct queries on changing documents,
with low startup cost and bounded memory.

## Validation of this review

Branch and remote state, merged PRs, open issues, benchmark arithmetic, and
the referenced source paths were inspected. No runtime implementation changed.
A dependency setup attempt stopped because the active pnpm is 12.0.0 and the
repository requires `^11.25.0 || >=12.3.4`; no fresh benchmark or test result is
claimed here.
