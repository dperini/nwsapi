# Performance review - 2026-09-07

This review describes commit `2ddfba2` and the measurements available on 2026-09-07.
See [common query fast paths](common-query-fast-paths.md) for the first changes that followed this review.
See [the benchmark guide](benchmarks.md) for later results.
The original measurements remain in the reviewed revision.

At that time, NWSAPI had lower times in 30 of 36 warm-query comparisons with `@asamuzakjp/dom-selector` v8.3.2.
Fifteen queries were at least 2× faster.
The largest losses involved searching through nested elements, checking positions, and evaluating logical selectors.
The plan was to improve those queries and measure the public APIs on changing documents.

## Acceptance bar

The review proposed **at least 2× faster** as the target for a clear performance advantage.
The target was proposed for future comparisons.
Apply it to each representative query, rather than only to the average for a category.

The test set should include IDs, classes, tags, attributes, relationships, positions, logical selectors, and state selectors.
Measure all-results queries, first-match queries, single-element matching, and closest-ancestor searches.
Test cold queries, repeated warm queries, and queries after document changes.

Use whole documents and smaller query scopes.
Include small documents, many siblings, and deeply nested elements.
Include queries that return no elements and queries that return many elements.

Every engine must return equivalent, correct results.
Report unsupported cases separately.
Repeat measurements to distinguish useful improvements from normal timing variation.
Also compare setup time, memory allocation, and memory retained after garbage collection.
A faster query should not require unlimited memory growth.

Record every case that remains below the target.
A finite test set cannot prove that an engine is faster for every possible selector and document.
It can show where further work is needed.

## Evidence and scope

This review inspected committed source code and measurements. It did not run new timing tests.
The three saved `assets/repo/bench/**/results.json` files identified engine source commit `d051a7e`.
That source was still present at reviewed commit `2ddfba2`.

The run used Node.js v26.5.0, `jsdom` v30.0.1, and an Apple M3 Max.
It measured nine passes of 100 calls per engine.
Chromium v151 supplied independent expected results.
All 36 queries returned equivalent results in all three engines.
See [the measurement method](benchmarks.md).

No pull requests were open at review time.
Performance pull requests #182–189, #194, #200, and #204–208 had already merged.
Their remaining local branches did not represent unfinished pull requests.
The only open issue at that time was [the 3.0 transition](https://github.com/dperini/nwsapi/issues/162).

The report compared direct NWSAPI `select()` calls with `document.querySelectorAll()` in `jsdom` calls.
The `jsdom` method adds integration work, so the call paths have different costs.
That report did not measure cold compilation, document changes, first matches, `match()`, or `closest()`.
It also did not compare smaller query scopes, browser execution, or memory use.
Some of its lower times differed by only about 1%.
Repeated runs were needed to determine whether those small differences were meaningful.

## Measured gaps, in priority order

These historical measurements use milliseconds per query.

| Priority | Query                    |  NWSAPI | `@asamuzakjp/dom-selector` | Assessment                 |
| -------- | ------------------------ | ------: | -----------: | -------------------------- |
| 1        | `div.example > p > a`    | 1.11820 |      0.14155 | NWSAPI takes 7.90× as long |
| 2        | `div:nth-last-child(3)`  | 0.16390 |      0.08035 | 2.04× as long              |
| 2        | `div:nth-child(2n)`      | 0.13904 |      0.08624 | 1.61× as long              |
| 3        | `:where(.card) > button` | 0.15388 |      0.12025 | 1.28× as long              |
| 4        | `div > button`           | 0.12548 |      0.11819 | 1.06× as long              |
| 4        | `div button`             | 0.12666 |      0.11999 | 1.06× as long              |


These were all six queries where NWSAPI was slower.
Use the recorded values to compare small differences, because chart labels round the values.
Fixing these losses was the first step toward the proposed 2× target.
Queries with small improvements also needed further work.

### 1. Plan selective child and mixed chains

At the reviewed revision, `reTagChain`, `parseChain()`, and `descendChain()` handled simple descendant chains separated by spaces.
They did not handle the `>` child relationships in `div.example > p > a`.
Profiling was needed to find how much this missing path contributed to the loss.

A proposed query plan would start from matching `div.example` elements and check their child relationships.
A query plan is a saved set of steps for running a selector.
Limit the work in this special path and use the general matching function when the limit is reached.
Compare it with searching from the final element in the selector.

Test deep trees, many siblings, few matches, nested starting elements, and empty results.
Keep results unique and in document order.
Preserve scope boundaries, callbacks, XML behavior, and immediate visibility of document changes.

The engine also needed to reconsider earlier routing decisions.
The `descentDeclined` cache remembered that a selector could not use a route.
At that revision, `switchContext()` cleared `partCounts` but did not clear that rejection.
A selector could therefore miss a faster route after moving to a different document or scope.
This affected speed rather than the returned result.
Test changing scopes and document shapes before choosing when to retry a route.

### 2. Make positional execution fit candidate density

A candidate is an element that the engine may need to test.
Queries can have many candidates under one parent or only a few scattered candidates.
Those cases can benefit from different position-checking methods.

At the reviewed revision, `nthElement()` built sibling arrays and searched parent and sibling arrays.
A limited sibling search already handled fixed child positions.
Adding that same method again would not explain the remaining `:nth-last-child(3)` loss.

Measure the cases with many and few candidates separately.
Consider sharing parent and position information within one query.
Keep short sibling searches when they are faster.

Tests should cover reverse positions, multiple parents, detached trees, and `:nth-of-type()` forms.
They should also cover sibling changes and callbacks that start another query.
Do not retain document position indexes between queries until their update rules are correct and tested.

### 3. Compile simple logical predicates and improve candidate selection

A predicate is a condition that tests an element.
The compiler already placed tag-only `:is()` and `:where()` checks directly in generated code.
It also handled compound `:not()` checks that way.
A class check such as `:where(.card)` still used the general matching path at that revision.

Compile eligible simple checks directly while preserving parser and compiler behavior.
In particular, preserve the rules for forgiving selector lists, which can ignore invalid entries where the selector syntax allows it.
Measure both `select()` and `match()`.

For `.card > :is(button, input)` and `:is(button, input)`, test collecting the listed tags instead of scanning every element.
Include the cost of copying collections, removing duplicates, and ordering results.
Those queries already beat the competitor in this run, but still took substantial time.

The engine already had a special path for `:has()` with a direct-child tag selector.
More general `:has()` queries still parsed and collected relative selectors for each starting element.
Consider saving validated plans and stopping as soon as a matching relative element is found.
This was an unmeasured opportunity, not a measured competitor loss.
Keep each starting element's search separate and validate the complete argument list.

### 4. Protect form-state correctness while reducing repeated ancestry work

The `input:enabled` and `input:read-write` queries were faster than, or close to, the competitor.
However, they took about 2.77× and 1.96× the time of NWSAPI v2.2.27.
The older engine was not a correctness reference because form-state behavior had changed.

At that revision, `isDisabled()` walked ancestors for each control.
Test whether controls can share fieldset information during one query.
Preserve the first-legend exception in disabled fieldsets.
Test nested and disabled fieldsets, document changes, and callbacks that start another query.
The recorded component page did not cover those fieldset cases.

## How to establish a durable advantage

1. **Measure the same public APIs.** Use separate `jsdom` instances with the default engine and the NWSAPI adapter. Run the same HTML and operations in both. Keep direct-engine measurements as a separate diagnostic.
2. **Measure changing documents.** Test queries after adding, removing, or moving elements. Also change attributes, selected and checked states, disabled states, and focus. Measure the change plus the query, as well as the query alone. Use the engines' normal cache settings.
3. **Measure common operations and scopes.** Include `querySelector()`, `matches()`, and `closest()`. Test `Element`, `DocumentFragment`, and `ShadowRoot` scopes. Include missing matches, duplicate IDs, and matches near the beginning or end. Use queries recorded from component tests where available, and clearly identify generated test pages.
4. **Measure setup and memory.** Include engine construction, first queries, and many short-lived documents. Test many distinct selectors around cache limits. Check how much memory remains after garbage collection. Verify that caches do not keep unused documents alive.
5. **Make results repeatable.** Save every sample and the package versions, source hashes, and test HTML hashes. Repeat tests in separate processes. Measure normal timing variation on a stable machine before enforcing speed thresholds. Require browser agreement and relevant document-change tests for each optimization.

The proposed order was to improve the measurements, fix the child-chain loss, and then improve position and logical queries.
Later work would address adapter setup and memory use based on those measurements.
A realistic `jsdom` component-test workload would help show whether the improvements benefit applications.

## Validation of this review

The review checked branch state, merged pull requests, open issues, benchmark arithmetic, and the referenced source code.
It did not change the engine.
Dependency setup stopped because the installed `pnpm` v12.0.0 did not meet the required version range.
The review therefore claimed no new benchmark or test result.
