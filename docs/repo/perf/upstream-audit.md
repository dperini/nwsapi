# Upstream selector audit completion

The local audit of `@asamuzakjp/dom-selector` and the linked `jsdom` migration concerns is complete through `eca95b8`. [Remote CI](https://github.com/dperini/nwsapi/actions/runs/34431950887) passes for that implementation. The scope includes the recorded issue discussions, all 1697 commit messages searched for performance leads, and the inventory of 308 open and closed PRs. Selected relevant patches were inspected. This is not a claim that every historical diff was reviewed or that every CSS feature is supported.

| Finding | Final outcome |
| --- | --- |
| Actual host workload and integration | The actual Range page passes 2808 subtests per trial. The host API suite covers 579 tests. All 19 migration issues have public selector reproductions, with computed-style integration and a packed Testing Library consumer. The observed host regression was fixed. No reliable Range speedup or upstream acceptance is claimed. |
| Exact ID attributes and shadow IDs | Guarded shortcuts landed in `8792132`. Duplicate IDs, context boundaries, cold rejection, and legacy controls protect eligibility. |
| Descendant and sibling traversal | Ancestor reuse, class-expression reuse, and first-child sibling routing landed. Rejected depth gates remain rejected because their timing or allocation costs failed the comparison. |
| General `:has()` | Validated bounded plans, selective candidates, early existence results, and narrowed sibling searches landed. Mutation, syntax, cache churn, and detached-node checks pass. The later snapshot-check removal is confirmed on AC power. |
| Attribute mutation | Stable wildcard cache identity landed in `eca95b8`. Confirmation lowers mutation-plus-one-query time by 41.6–46.3%. Warm changes range from -2.4% to +1.0%. Node and Chromium retention controls pass. |
| Repeated state checks | Disabled, validity, language, and direction costs were profiled. Direction is dominated by host bidi work. No additional cache is retained because the evidence does not establish a safe net gain. The disabled-fieldset observation is resolved below. |
| Allocation, ordering, and ownership | Balanced merging, lazy boundaries, and weak observer ownership landed. Allocation and retained-memory measurements remain separate. The dense Node grouped-query cost is an accepted tradeoff, not a pending promise of a speedup. |
| Wrapping and duplicate parsing | Existing adapter boundaries and resolver caches cover the relevant designs. No equivalent private-wrapper identity bug was found. Cold ineligible selectors remain comparison controls. |
| XML, filtered positions, and syntax | Namespace rules, filtered child positions, CSS comments, foreign HTML elements, and the three recorded browser syntax gaps have tested implementations. Modern and legacy runs pass all 141 selected WPT pages. |
| Private host operations and CSP | Private host imports are excluded from the portable core. A CSP interpreter is a separate architecture change. Complex selectors still require dynamic code generation. These are documented limits, not unfinished patches in this audit. |

The [performance journal](journal.md) preserves measurements, rejected experiments, commands, and raw report links. The [compatibility document](../selector/compatibility.md) describes tested behavior and host-dependent limits. Rendering, publishing a release, posting upstream, and obtaining upstream adoption were outside this local audit.

## Disabled-fieldset validity observation

The state profile exposed disagreement with the saved `jsdom` matcher. The [reproduction report](../../../assets/repo/bench/fieldset-validity.json) resolves it: `nwsapi` agrees with Chromium. Required controls disabled by a fieldset match neither `:valid` nor `:invalid`. A populated required control inside the first legend remains enabled and matches `:valid`. The saved host matcher incorrectly includes the two disabled controls in its `:valid` result for this fixture.

Run `node scripts/repo/bench/fieldset-validity.mts` to regenerate the report and assert the expected Chromium and engine identities. It records the browser version and engine hash. This closes the observed discrepancy without changing correct engine behavior or claiming a timing gain.

## Stopping point

Every finding in the recorded audit has an implementation, existing coverage, a measured rejection, or an explicit architecture boundary. There are no pending implementation experiments in this work list. The historical reports under `.claude/reports/` now point here so their old proposals do not restart completed work.
