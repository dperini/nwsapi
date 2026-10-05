# Broader selector optimization plan

## Status and instruction

**Status: implementation is in progress.** The user resumed this plan and
asked to continue implementation. The type-union experiment is under
qualification. The later tasks remain open until their evidence is recorded.

Written October 5, 2026. The plan targets query time across more selector
families, including cases where `nwsapi` has only a small lead over the
comparison library.

Work through this document in order. Record a decision and its evidence at
each gate. A rejected experiment is a valid outcome. A trained model,
emitted function, or faster small benchmark is not by itself evidence that
complete queries became faster.

The intended outcome is lower complete query time across useful selector
families, preserving exact CSS semantics, result identity, and document order.
The tiny PyTorch model remains a research option for decisions with measurable
headroom. Several improvements below remove work unconditionally and should
not require inference on every query.

## Instructions for the implementation

> Read `AGENTS.md`, this document, and the existing neural outcome.
> Use `/tmp/nwsapi-v3-compiler-land` on `prerelease/3.0.0`. Preserve the
> uncommitted experiment described here. Start by qualifying the two existing
> type-union changes. Do not assume the partial Chromium pilot proves a
> two-host improvement. Preserve raw data and use new output directories.
> Implement and measure one independent mechanism at a time. Complete the
> structural-position, scoped-union, ancestor-reuse, and form-state tasks in
> their stated order, retaining only justified changes. Broaden training only
> after exact alternative routes have positive end-to-end headroom. Keep
> unsupported contexts on their existing paths. Follow the validation and
> reporting gates. Commit logically and push authorized, completed work to
> `prerelease/3.0.0`. Update the execution log after every step. Do not claim
> completion of a deferred task or count noisy controls as performance wins.

## Terms used in this plan

If you are new to selector engines, start with the [performance work
guide](guide.md). In this plan, a _preflight_ is a cheap check that can rule
out a more expensive operation. A _route_ is one exact way to find and test
candidate elements. A _gate_ is a condition a proposed change must pass
before we keep it. A _host_ is the environment running the query, such as
Chromium or `jsdom`.

## Plan in plain language

| Task | What it tries to do                                                                                           |
| ---- | ------------------------------------------------------------------------------------------------------------- |
| A    | Check whether a cheaper copy and earlier type checks speed up logical selectors.                              |
| B    | Avoid scanning the same parent's children again for every positional match.                                   |
| C    | Search inside a known ancestor when that can reduce the number of elements checked.                           |
| D    | Reuse an ancestor result when a safe logical selector can use it.                                             |
| E    | Share form-state checks when several selectors need the same information.                                     |
| F    | Train a small model to choose between exact methods only if a choice can save more time than the model costs. |
| G    | Publish a report that shows the gains, regressions, and open questions.                                       |

Each task starts with a small experiment. Keep a change only after it returns
the correct elements and improves complete queries under the measurement
rules below.

## 1. Starting state

### Checkout and completed work

- Worktree: `/tmp/nwsapi-v3-compiler-land`.
- Branch: `prerelease/3.0.0`.
- Last implementation/report revision before this handoff: `abddf4c`.
- All commits through `abddf4c` were pushed to `origin/prerelease/3.0.0`.
- The original `/Users/jdalton/projects/nwsapi` checkout is separate.
- The failed neural prefix experiment is documented in
  [neural-planner-outcome.md](neural-planner-outcome.md).
- Its report is available at
  `https://nwsapi-model-guide.localhost:1355/neural-planner-2026-10-05.html`.
- The shipped v3 source at `abddf4c` has no neural inference dependency.

The preceding neural work repaired invalid route labels, preserved actual
baseline measurements, compiled scalar inference, trained a two-unit PyTorch
continuation model, and measured that model inside complete queries. Its
four-anchor prefix design took 41.5% more Chromium time and 70.7% more `jsdom`
time on its development suite. That candidate remains offline.

### Uncommitted implementation experiment

The user asked to continue implementation after these local changes were
made. They have **not** been landed, pushed, or fully qualified:

| File                                     | Local change                                                                                  | What remains                                                   |
| ---------------------------------------- | --------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| `src/core/lookup/tag.mts`                | `byTags()` uses `collectionCopy()` instead of `sliceCall()` when copying each type collection | Mutation, fallback, retention, cold, and two-host confirmation |
| `src/core/compile/type-union.mts`        | New compiler helper emits all literal type checks before namespace folding fallbacks          | Correctness coverage and two-host confirmation                 |
| `src/core/compile/pseudo/logical.mts`    | Calls that helper for simple `:is()` / `:where()` type lists                                  | Same qualification as the helper                               |
| `scripts/repo/bench/survey/coverage.mts` | Extends 36 comparison selectors to 68                                                         | Static checks and future workload expansion                    |
| `scripts/repo/bench/survey/run.mts`      | Adds `--expanded`, actual power records, and refusal to overwrite existing output             | Static checks and audit of CLI compatibility                   |
| `scripts/repo/bench/survey/union.mts`    | Measures four variants on 86 cases in both hosts                                              | Static checks, complete run, and independent repeat            |

The new files above are currently untracked. The built `dist/nwsapi.js`
contains the experimental combined candidate, not the last committed runtime.
Do not mistake a build from the dirty worktree for the published baseline.

### Saved evidence and benchmark runs

`assets/repo/bench/selector-gaps-2026-10-05-r1/` contains:

- `baseline.cjs.gz`: frozen unchanged runtime.
- `baseline-chromium.json`: completed 68-case competition comparison.

`assets/repo/bench/selector-union-2026-10-05-r1/` contains:

- `baseline.cjs.gz`, `collection-copy.cjs.gz`, `literal-checks.cjs.gz`, and
  `combined.cjs.gz`: exact experimental bundles.
- `fixtures.json.gz`: frozen 86-case input list.
- `chromium.json`: completed Chromium pilot.
- **No completed `jsdom.json`.** The process was interrupted with SIGINT at
  the user's request and exited with status 130. It had reached atomic-page
  cases. The runner writes a host's file only after finishing that host, so
  progress messages are not recoverable timing evidence.

No benchmark process from that run should still be active. Do not recreate
the missing `jsdom` report from terminal output or report two-host results.

Frozen bundle SHA-256 values, in variant order:

```text
baseline
a9f16f10b9ef545ef204795444041c5c01c2a619bf4154572a26122b8ac263c1

collection-copy
60ec645e28e89ad51adacebf87f6294ad91e9ad6d2ad992e295f13104aaca793

literal-checks
7c2e325d0341559e17dde2054a806c5953da6bbbe88d2ff7b5af82735f795e40

combined
c437bcebdf0e5b35da4baba8f75d259fddda9aae7d62f13f192da70458f924a6
```

The artifacts and experimental source remain local pending qualification.
Preserve them before any worktree cleanup. The baseline archive is especially
important because rebuilding the current dirty tree produces the candidate.

### Tooling

Use the pinned Node executable through this PATH on this machine:

```sh
export PATH=/Users/jdalton/.nvm/versions/node/v26.10.0/bin:$PATH
```

The system Node previously failed with a CPU-architecture mismatch. Use
`node scripts/repo/run.mts ...` for repository scripts. The Vitest config is
`.config/repo/vitest.config.mts`, not `.config/vitest.config.mts`.

The external comparison installation is:

```text
/tmp/nwsapi-audit-deps-20261003
```

It contains `@asamuzakjp/dom-selector` 9.2.4. The worktree's own direct
dependency is 9.1.1. Pass the external directory explicitly for a comparison
with the saved 9.2.4 survey. Do not silently substitute the installed older
version or claim either pin is the latest available version.

Python and PyTorch already have pinned development tooling. Use
`.cache/bin/uv run --project .config/model-training --locked python ...`.
Do not add a second ML environment or a library runtime dependency.

## 2. What the current evidence says

### The expanded baseline found previously unmeasured losses

The 68-case Chromium survey used 9 rotating rounds, at least 30ms per timed
round, fresh equivalent documents, warm queries, and AC power at boundaries.
Versions were Chromium 154.0.8037.0 and `@asamuzakjp/dom-selector` 9.2.4.
The source was the frozen unchanged v3 bundle above.

| Selector                              | `nwsapi` median | Competitor / `nwsapi` time | Interpretation                         |
| ------------------------------------- | --------------: | -------------------------: | -------------------------------------- |
| `dl dd :where(a, code)`               |        823.75µs |                    0.0592× | Large loss, about 16.9× as much time   |
| `ul li :is(a, code)`                  |       1493.91µs |                    0.3467× | Large loss, about 2.88× as much time   |
| `.card > .list > .row > :is(a, span)` |        528.83µs |                    0.5709× | About 1.75× as much time               |
| `.card :is(a, span)`                  |        525.86µs |                    0.7981× | About 1.25× as much time               |
| `.card > :nth-of-type(2n)`            |        517.97µs |                    0.9633× | Small loss, needs repeated measurement |
| `input:read-only`                     |         67.65µs |                    1.0413× | Thin win                               |
| `input:read-write`                    |         68.84µs |                    1.1200× | Thin win                               |
| `table tr :is(td, th)`                |         69.95µs |                    1.3342× | Modest win with useful absolute cost   |

This is one host and a development suite. These ratios are observations,
not universal library rankings. A 0.2µs gap on an empty query should not take
priority over hundreds of microseconds of avoidable traversal.

### The pending two-change pilot is promising

The completed Chromium pilot compares the four frozen bundles on the same
86 cases. It uses 7 rotating rounds of at least 15ms, with 16 queries per
batch. The extra 18 cases vary mixed sibling counts and ordering.

| Variant              | Geometric baseline/candidate ratio | Worst candidate/baseline time |
| -------------------- | ---------------------------------: | ----------------------------: |
| Collection copy only |                           1.06668× |                      1.04960× |
| Literal checks only  |                           1.14065× |                      1.01984× |
| Combined             |                           1.22552× |                      1.03895× |

The combined geometric query-time reduction is about 18.4%. This is a
Chromium pilot including unchanged controls, not a landed result.

Examples from that pilot:

| Selector                     | Combined baseline/candidate ratio |
| ---------------------------- | --------------------------------: |
| `:is(button, input)`         |                            1.272× |
| `.card > :is(button, input)` |                            1.258× |
| `:is(input, button)`         |                            2.011× |
| `:is(button, input, label)`  |                            3.440× |
| `:is(button, button)`        |                            3.168× |
| `table tr :is(td, th)`       |                            1.343× |
| `dl dd :where(a, code)`      |                            1.005× |

The last row barely changes. Do not claim that the pending changes solve
the largest documentation-page loss. That query needs different work.

## 3. Priority and dependency order

| Order | Work                                                              | Reason to do it here                                                     | Stop condition                                                                |
| ----- | ----------------------------------------------------------------- | ------------------------------------------------------------------------ | ----------------------------------------------------------------------------- |
| A     | Finish qualification of the two pending changes                   | Small changes with positive Chromium evidence                            | Repeated correctness failure or material unexplained regression               |
| B     | Remove repeated parent lookup in typed positional queries         | Visible linear parent search and a newly exposed thin loss               | Operation counts do not confirm repeated work, or full queries do not improve |
| C     | Prototype scoped descendant type-union execution                  | Largest absolute losses are compound ancestor/type-union queries         | Prefix discovery and local queries cost as much as the original route         |
| D     | Extend ancestor-result reuse to a narrow pure logical suffix      | Reuse an existing proven mechanism for more selector forms               | Requires relaxing traversal/state invariants beyond the narrow suffix         |
| E     | Investigate shared disabled-state preflight for form selectors    | `read-only` and `read-write` remain thin wins                            | Guard, invalidation, or feature cost consumes the saving                      |
| F     | Train a multi-family PyTorch policy only for useful route choices | Train on actual remaining choices after mechanical wins                  | Free-choice headroom or actual integrated model fails its gates               |
| G     | Reconfirm competition gaps and publish the report                 | Show the user what changed, what remains, and what the model contributed | Missing provenance or failed rows must block a win claim                      |

Complete or reject one mechanism before changing the next. Do not combine
three unmeasured ideas and try to infer their contributions afterward.
Do not remove the existing density guard just because a broader scan helps
one fixture. An earlier density-threshold change regressed its target.

## 4. Common measurement and promotion contract

### Measurements to keep separate

1. Current v3 versus the proposed change on identical fixtures.
2. Current/candidate v3 versus the explicitly pinned competitor.
3. Compiled resolver time with candidates already prepared.
4. Complete public query time including candidate lookup and planning.
5. Cold compilation or first use.
6. Mutation followed by query.
7. Memory/retention and code size.

Only item 4 establishes the primary query-time win. Items 3 and 7 explain
it. A result from item 3 must not be labeled as a full API improvement.

Run CPU-heavy work sequentially. Do not train, build, test, profile, or run
another benchmark while timed work is running. Record AC power before and
after each host. Boundary power records do not prove the state between them.

### Fixture coverage

Retain all 68 comparison selectors and the 18 mixed sibling controls.
For each changed family add these variations before choosing a final policy:

- Sizes: 0, 1, 8, 32, 256, and 2048 relevant candidates where practical.
- No matches, sparse matches, and dense matches.
- Shallow/wide and deep/narrow DOM shapes.
- Interleaved and clustered types.
- Duplicated alternatives and alternatives with no candidates.
- Prefix roots that are absent, sparse, broad, nested, or disjoint.
- HTML, foreign elements, and case-sensitive XML controls.
- Document, element, fragment, detached subtree, and shadow-root contexts.
- Warm repeated queries, first calls, and mutation/query sequences.
- Callback, extension, and legacy controls for any changed compiler path.

Some controls intentionally use the original route. Verify the bypass through
instrumentation outside timing when necessary. Equal answers alone do not
prove an optimization route executed.

The current `union.mts` reuses the planner measurement harness. Its generic
`features` arrays are not a multi-family training schema. Most page cases
have empty `tags`, so those fields are unsuitable model inputs. Define a
new explicit schema before training.

### Default acceptance thresholds

Freeze these before looking at a final evaluation set:

- Exact ordered results for every correctness case.
- At least 1.05× geometric speed ratio on the declared affected workload
  in each host for a generic runtime optimization.
- No reproducible case above 1.15× baseline time.
- Unchanged controls centered close to 1.0. If controls shift materially,
  investigate run conditions before attributing the change to the code.
- An independent, reversed-order repeat at 9 rounds of at least 24ms.
- Report absolute nanoseconds/microseconds as well as relative ratios.
- Review cold and mutation results separately. A warm-only win can be real,
  but a large cold/mutation regression needs an explicit scope decision.

A smaller mechanical compiler cleanup may be retained with a narrower
demonstrated benefit, but record the exception and avoid claiming it passed
the larger performance gate. Never change a threshold after seeing results
just to turn a failure into a pass.

For thin margins, bootstrap paired rounds with a fixed random seed and report
95% intervals for candidate/baseline time. Retain a simple fixture-level
summary too. Timing intervals describe run noise, not variation across all
applications. Do not relabel an inspected development family as a blind
holdout. The existing 86 cases are already inspected.

## 5. Task A: finish the existing type-union experiment

### A1. Preserve and inspect before running anything

```sh
git branch --show-current
git status --short
git log -6 --oneline
git diff -- src/core/lookup/tag.mts src/core/compile/pseudo/logical.mts
```

Read the three new untracked `.mts` files listed in section 1. Inspect the
bundle hashes and labels in the saved Chromium report. If the worktree has
other user changes, preserve them and isolate new implementation work.

Do not rerun into either `r1` directory. The runners refuse existing outputs.
The completed run in `r2` recollected Chromium and finished both hosts.
Its current results are summarized below. Use a new output directory for
the independent repeat.

### A2. Two-host pilot and independent repeat

The `r2` run measured 86 cases and four variants in Chromium and `jsdom`.
It used seven rotating rounds of at least 15ms per case. The reversed-order
`r3` repeat used nine rounds of at least 24ms. Both runs recorded AC power at
the start and end of each host.

| Host                  | Variant         | `r2` ratio | `r3` ratio |
| --------------------- | --------------- | ---------: | ---------: |
| Chromium 154.0.8037.0 | Collection-copy |     1.066× |     1.070× |
| Chromium 154.0.8037.0 | Literal checks  |     1.142× |     1.142× |
| Chromium 154.0.8037.0 | Combined        |     1.223× |     1.227× |
| `jsdom` 30.0.1        | Collection-copy |     1.044× |     1.047× |
| `jsdom` 30.0.1        | Literal checks  |     1.110× |     1.122× |
| `jsdom` 30.0.1        | Combined        |     1.164× |     1.181× |

Each ratio is the geometric mean of baseline time divided by candidate time
across 86 cases. A ratio above `1` means the candidate was faster overall.
These all-case summaries include unchanged controls. They do not replace the
affected-workload gate.

The combined variant has no case above the 1.15× slowdown limit in either
Chromium run. In `jsdom`, the same no-match selector,
`:is(missing, absent)`, is 1.164× slower in `r2` and 1.172× slower in `r3`.
The collection-copy-only variant shows the same regression. The
literal-checks-only variant does not. This points to collection copying as
the cause for this case.

The reports and frozen bundles are in
`assets/repo/bench/selector-union-2026-10-05-r2/` and
`assets/repo/bench/selector-union-2026-10-05-r3/`. The `r4` run added an
empty-collection preflight and repeated 86 cases in Chromium on AC power. Its
combined geometric speed ratio was 1.220×. The slowest case had a baseline to
candidate ratio of 0.964×, which means the candidate took about 3.7% longer.
The no-match selector `:is(missing, absent)` measured 1.314× faster in this
Chromium run, unlike the earlier `jsdom` results.

The Mac switched to battery before the `jsdom` pass. The run did not save a
`jsdom` report, so these results do not confirm the candidate in both hosts.
The combined bundle hash is
`5c0574fa563a169690af487217286f1726821c719dcb68ef52a861d51a477bd9`.
The candidate is included on the v3 prerelease branch for evaluation. Repeat
the `jsdom` pass on AC power in a new output directory before describing the
change as a verified two-host improvement or closing task A.

### A3. Understand the collection change

File: `src/core/lookup/tag.mts`, inside `mergeTagCollections()`.

Before:

```text
list = engine.sliceCall(collections[i])
```

Candidate:

```text
list = engine.collectionCopy(collections[i], context)
```

`collectionCopy()` already knows how to reuse mutation-aware snapshots and
return an independent array. Do not return its internal cached snapshot as
the public result. Read these implementations before altering the call:

- `src/core/collection/copy.mts`.
- `src/core/collection/snapshot/get.mts`.
- `src/core/collection/snapshot/skip.mts`.

Required behavior checks:

1. Query a sparse two-type union repeatedly with at least 16 elements per
   relevant collection so snapshot reuse is actually eligible.
2. Insert a matching node at the beginning, middle, and end. Verify order.
3. Remove a node and move one between parents. Verify no stale member.
4. Query duplicate type alternatives. Verify each element appears once.
5. Alter the returned array, then query again. Internal cached membership
   must be unaffected.
6. Repeat with element and fragment scopes, detached roots, and adoption
   into another document.
7. Exercise missing WeakRef, WeakMap, and MutationObserver capabilities.
   Existing fallback copying must remain correct.
8. Exercise callback and legacy paths. Preserve their current semantics.
9. Inspect retention with detached contexts. Reusing a cache must not add a
   strong root retained for the lifetime of a compiled selector.

Measure warm copy cost, first snapshot creation, and mutation invalidation
separately. A smaller HTMLCollection-copy cost is an explanation; the complete
query is still the acceptance measurement.

### A4. Understand the generated-condition change

Files:

- `src/core/compile/type-union.mts`.
- `src/core/compile/pseudo/logical.mts`.

The previous condition conceptually does:

```text
name == "button" || matchesTag(element, "button") ||
name == "input"  || matchesTag(element, "input")
```

An input reaches an unnecessary helper before its cheap equality test.
The candidate checks all literal names first. Only if those fail can a
foreign-namespace case reach the folding helpers. XML uses exact comparisons.
Legacy compilation retains the original interleaved fallback behavior.

Required proof and coverage:

- Read `matchesTag()` in `src/core/lookup/tag.mts`. Explain why, after every
  lowered literal comparison fails, the same-namespace branch cannot match.
- Verify that switching documents clears or rebinds compiled namespace
  assumptions. `src/core/dom/context.mts` currently clears the resolver caches.
- Inspect the parsed generated function or count helper calls. Do not assert
  entire source strings as a correctness test.
- Check first, middle, last, duplicate, and absent alternatives.
- Check `:is()` and `:where()` alone, inside compounds, and after combinators.
- Check HTML case handling, mixed-case foreign local names, prefixes, XML,
  nested logical expressions, and context switches using one engine.
- Check all-result, first-result, and element-match APIs.
- Keep the supported grammar narrow. This helper is for the existing simple
  lowercase type-list branch, not arbitrary forgiving lists.
- Do not move tests across a branch that changes the candidate element or
  across custom extension work without proving that reordering is permitted.

### A5. Complete and repeat the measurements

After static checks and the authorized correctness checks, build once and
freeze the candidate. These are future execution commands:

```sh
node scripts/repo/run.mts scripts/repo/build/run.mts
NWSAPI_REQUIRE_AC=1 node scripts/repo/run.mts scripts/repo/bench/survey/union.mts \
  assets/repo/bench/selector-gaps-2026-10-05-r1/baseline.cjs.gz \
  assets/repo/bench/selector-union-2026-10-05-r2
NWSAPI_REQUIRE_AC=1 node scripts/repo/run.mts scripts/repo/bench/survey/union.mts \
  assets/repo/bench/selector-gaps-2026-10-05-r1/baseline.cjs.gz \
  assets/repo/bench/selector-union-2026-10-05-r3 repeat
```

Use different directory names if those already exist. Check that all four
variant hashes are unchanged between the passes. If source changes are needed,
the result is a new candidate with a new comparison, not a continuation of
the frozen one.

The runner constructs isolated component variants with exact single-site
replacements in built code. Its current replacement assertion must remain
fail-closed. If the build formatting changes, update the benchmark carefully
or use the existing AST helpers. Never silently substitute the baseline for
an unavailable variant.

**A is done when:** both changes have an individual and combined outcome,
correctness evidence, full-query measurements in both hosts, and a recorded
retain/reject decision. Commit the two runtime mechanisms separately when
retained, then commit benchmark tooling/evidence and report updates logically.

## 6. Task B: typed positional selectors across many parents

### B1. Confirm the remaining repeated work

Start at `src/core/compile/position/nth-of-type.mts`.
`getParentSnapshot()` currently scans the `snapshots` array to find a parent.
When many parents contribute children, that can repeatedly search a growing
list. The next child often has the same parent as the previous child.

This is a source-level hypothesis. Count parent-record comparisons outside
timing for 1, 8, 64, 300, and 1000 parents. Use homogeneous and mixed child
types. Separate parent-table lookup from sibling enumeration and local-name
reads. Do not assume all of the 517.97µs positional baseline comes from this
loop.

### B2. Implement the smallest useful improvement first

1. Try a query-local last-parent/last-snapshot check before the linear lookup.
2. Clear it alongside existing positional state when the resolver resets.
3. Preserve behavior for `parent === null`. A WeakMap cannot use null as a key.
4. Keep the current namespace-plus-local-name type key.
5. Keep callback queries on their existing fresh-state path.
6. Measure grouped and interleaved candidate-parent order. The fast check
   helps grouped order and must have a cheap miss for interleaved order.

If comparison counts remain high for nonconsecutive parents, separately try
a lazy query-local WeakMap from parent to its existing snapshot record.
Allocate it only after a small measured parent count makes it worthwhile.
Do not pick that threshold from the final evaluation set. Keep the array
fallback for hosts without the required capability.

Do not replace the entire positional algorithm in this step. Existing
homogeneous-type and ordered-candidate fast paths may already be valuable.

### B3. Required behavior and measurements

- `nth-of-type` and `nth-last-of-type` with odd/even, constants, negative
  coefficients, and always-false formulas.
- Same local name in different namespaces.
- Reversed candidates and candidate lists that revisit a parent.
- Separate calls before/after insertions, removals, reparenting, and callbacks.
- Query-local state reset after empty results and thrown callbacks.
- Small homogeneous controls and many-parent mixed-type cases.
- First-result and all-result calls measured separately.

**B is done when:** operation counts identify the saved work, exact checks
pass, both hosts have complete-query evidence, and the small-case/mutation
tradeoff is explicit. If the last-parent check wins but the WeakMap loses,
retain only the first change.

## 7. Task C: scope terminal type unions to useful prefix roots

### C1. The hypothesis

`dl dd :where(a, code)` currently considers a broad population of terminal
types and then checks ancestor constraints. The matching `dd` regions may be
much smaller than the full document. An exact alternative is:

1. Find elements matching the prefix `dl dd`.
2. Search their descendant regions for `a` or `code`.
3. Return unique results in document order.

The model is not needed to make this algorithm exact. A planner may later
choose between it and the current route when the costs differ by shape.

### C2. First prototype scope

Support only:

- HTML document contexts.
- No callbacks, legacy mode, registered selector/combinator extensions, or
  unsupported host capabilities.
- A pure prefix accepted by existing pure-selector parsing.
- A final **descendant** relationship followed by a simple terminal
  `:is(tag, tag, ...)` or `:where(tag, tag, ...)` list.
- The existing simple lowercase type-name grammar, initially at most 8 types.
- No foreign-type ambiguity. Use the established compatibility guard and
  retain the current route when it declines.

Examples eligible for the prototype:

```text
dl dd :where(a, code)
ul li :is(a, code)
.card :is(a, span)
div.example :is(p, pre)
```

Initially ineligible:

```text
.card > :is(a, span)             terminal child relationship
.card :is(.link, [href])         alternatives are not simple types
.card :is(a, :has(span))         nested relationship predicate
.card :is(a, *)                 wildcard alternative
```

Do not use string splitting that mistakes whitespace inside the argument
for a descendant combinator. Use token positions or the existing pseudo
reader and pure parser. Malformed and forgiving-list behavior must continue
through the established parser. An optimization probe must not emit new
syntax errors.

### C3. Integration design

Suggested new implementation module:
`src/core/select/scoped-union.mts`.

Add a typed optional plan field only after the prototype pays for itself.
The likely owner is `QueryPlan` in `src/core/state/types.mts`, with execution
through `src/core/select/all.mts` before fetching the global terminal list.
Do not add untyped properties to engine state or repurpose `bulkHas`.

The plan should contain selector-invariant data only:

```text
ScopedUnionPlan {
  prefix: prepared prefix plan,
  tags: unique normalized type names,
  terminalRelation: descendant
}
```

Compile the prefix with the existing preparation/collection machinery.
Do not call the public `select()` recursively for every prefix root merely
to reuse code: that can switch engine context, clear route decisions, repeat
parsing, and add unmeasured state changes. Reuse prepared candidates and
compiled predicates through explicit helpers instead.

Execution contract:

1. Check cheap eligibility before creating arrays or reading extra collections.
2. Obtain prefix candidates using the prefix plan's ordinary safe seed.
3. Apply the exact compiled prefix predicate.
4. Preserve prefix roots in document order.
5. For descendant regions, skip a root contained by a previously retained
   root. The outer region already covers its descendants.
6. Enumerate the terminal type union inside retained regions.
7. Merge any per-type lists in document order and remove duplicates.
8. Return an independent result array with the same identities as the old path.

Important: `byTags()` can deliberately return a broad `*` list and rely on
the resolver to filter it. Its return value is **not** proof that every
element belongs to the requested types. Reuse the exact terminal predicate
or a helper whose contract guarantees filtering. Do not accidentally return
the unfiltered broad list.

Do not fetch both the full global terminal collection and all prefix data
just to choose a route. Include any route-choice preflight in the measured
cost. Record a declined route's discovery cost too. The failed neural prefix
experiment demonstrates why a useful-looking probe can still lose overall.

### C4. Cost controls and route evidence

Compare at least:

1. Current global terminal route.
2. Forced scoped descendant route.
3. A simple static/cheap-count guard chosen on development data.
4. A model-selected route only if task F's gates justify it.

Instrument route entry, prefix candidate count, accepted roots, skipped
nested roots, terminal candidate visits, and actual completion. Keep counters
out of timed production variants. Save the costs of complete pipelines.

Predeclare fixtures where the scoped route should lose: a prefix matching
nearly every element, deeply nested prefix roots, one root covering almost
the entire document, and a very sparse global terminal population. A plan
that only helps the documentation page is not sufficient evidence for a
general dispatch rule.

### C5. Child-union extension is a separate decision

After descendant execution is qualified, evaluate a terminal `>` variant
for cases such as `.card > .list > .row > :is(a, span)`.

Do not apply the descendant rule that discards nested roots to child queries.
A nested matching parent has its own distinct children. Likewise, concatenating
each parent's direct-child results can produce the wrong document order when
parents are nested. Either use a proved ordered merge or decline nested roots
before emitting results. Include those cases in correctness coverage.

**C is done when:** scoped execution is exact, the selector grammar is explicit,
the real decision cost is charged, and both winning and losing shapes are
recorded. If no cheap selector/DOM facts choose reliably, keep the strategy
experimental and pass its honest headroom data to task F.

## 8. Task D: reuse ancestor results with a pure logical suffix

Read:

- `src/core/ancestor/reuse.mts`.
- `src/core/ancestor/token-pattern.mts`.
- `src/core/compile/resolver.mts` and its ancestor-state handling.
- Existing ancestor benchmarks and journal entries.

The existing eligibility scanner permits one descendant walk and selected
structural predicates. It rejects logical pseudo-classes. A simple terminal
type union does not move the current element, so it may be a safe additional
suffix for that existing one-walk cache.

Start with `.card :is(a, span)` and `.card :where(a, span)`. Permit only the
same narrow type-list grammar used by task A. Consume the entire pseudo token
without counting whitespace inside its arguments as another walk.

Preserve these invariants:

1. Exactly one eligible descendant walk.
2. A suffix that cannot move the candidate or call extension code.
3. No reuse across API calls or DOM mutations.
4. Correct restoration of compiler temporaries and candidate identity.
5. Callback, relative, legacy, extension, and unsupported logical forms keep
   their original paths.
6. Silent eligibility checking. Validation remains the parser's job.

Do not remove the `walks == 1` restriction to make `dl dd :where(a, code)`
eligible. That query has two descendant relationships and belongs to task C
or a separately proved multi-walk algorithm.

Measure shared-parent siblings, one candidate per parent, reversed candidate
order, no-match prefixes, and both shallow and deep ancestors. Record cold
compile cost because an extra eligibility scan can hurt first calls even
when warm execution improves.

**D is done when:** the narrow suffix extension is proved and measured, or
its overhead/complexity is documented as a rejection. Do not generalize to
arbitrary `:is()` branches in the same commit.

## 9. Task E: thin-margin form-state selectors

Files:

- `src/core/compile/pseudo/input/state.mts`.
- `src/core/predicate/form.mts`, especially `isDisabled()`.
- `src/core/state/query.mts` and resolver state owners if a new local fact is
  required.

The ordinary component fixture has many inputs and no disabled fieldsets.
The current predicate can walk ancestors repeatedly to discover that fact.
Investigate whether one cheap, query-local proof can avoid those walks.

### E1. Measure and constrain the proof

Count separately: input type reads, `readOnly` reads, own `disabled` reads,
parent traversals, tag checks, and fieldset/legend handling. Preserve the
existing missing-input-type shortcut. It is already implemented.

A zero-fieldset proof is only useful when:

- It describes the actual candidate roots.
- It is cheaper than the walks it avoids.
- The current call cannot mutate the relevant tree through supported callbacks
  or extensions before the proof is used.
- Its state does not leak to a nested query or subsequent call.

Do not inspect `ownerDocument` and conclude that a detached element has no
fieldset ancestor. A detached subtree may contain fieldsets absent from the
document collection. Do not use this proof for arbitrary public `match()`
calls without establishing the element's actual root.

Start with a trusted internal all-results document path where candidate
membership and mutation restrictions are established. Keep the standalone
predicate's default behavior complete. A lexical per-resolver fact is easier
to reason about than a mutable global engine flag.

### E2. Preserve independent disabled rules

Even when no fieldset ancestor is possible:

- An element's own `disabled` state still matters.
- Options can inherit disabled optgroups through ordinary wrappers.
- The first legend exception matters when a fieldset does exist.
- Custom form-associated elements may require the existing host/native path.
- Read-only and read-write remain complements of the same eligibility rule.
- Input type, textarea, contenteditable, namespace, and case semantics remain
  unchanged.

Measure empty, small, and large forms; many/nested fieldsets; disabled and
enabled states; first-legend descendants; detached subtrees; and attribute
mutations between calls. Include `:enabled` and `:disabled` to see whether the
same proved fact helps several families without duplicating logic.

**E is done when:** a shared proof pays for its cost on complete queries and
its applicability is explicit. If global discovery is as expensive as local
walks, reject it rather than caching a stale DOM assertion.

## 10. Task F: broaden the real PyTorch model only after useful choices exist

### F1. What the model should learn

The model should choose between exact algorithms whose winner changes across
workloads. It should not predict whether an element matches CSS.

Good possible decisions after the earlier tasks:

- Global terminal candidates versus scoped prefix regions.
- Sparse ordered type-list merging versus a broad filtered scan.
- A query-local positional index versus direct small-parent traversal.
- Whether a narrowly eligible workload justifies limited profiling.

The task A improvements are mostly compiler/copy improvements with no need
for a per-query decision. If one action wins throughout its supported domain,
emit that fixed choice and remove runtime inference for that domain. Saved
PyTorch weights can remain an experiment artifact without adding query cost.

### F2. New dataset contract

Create a new versioned dataset for multi-family decisions. Do not feed the
old six-pipeline adaptive data into a new route schema or reinterpret its
labels. Suggested tooling directory: `scripts/repo/bench/planner/selector/`.

Each row must include:

```text
formatVersion
host and hostVersion
buildSha256 and compiler/variant hashes
fixtureSha256, applicationFamily, templateFamily
selector, API, contextKind, queryState
legalActions and proved executed action for each timed variant
actualBaselineNs and baseline round samples
completePipelineNs[action] and paired round samples
features and the stage at which each feature is available
featureCostNs, or evidence that it is included in pipeline timing
splitGroup and split assignment
mutationSequence identity when relevant
power and measurement settings
```

Store unavailable features as unavailable, not zero. A zero count is a real
observation and can justify an exact empty result; an unavailable count cannot.
Keep the actual baseline cost even if its route appears equivalent to another
timed variant. Do not reconstruct it from a route label.

### F3. Feature budget

Prefer facts already available at compile or dispatch time:

- Selector family, number of alternatives, and simple predicate kinds.
- Relationship count and type, including terminal child versus descendant.
- Existing prepared seed kind.
- Counts of candidate lists that the selected baseline already obtains.
- Host as a compile-time/static input, folded into generated constants.
- A bounded, query-local observation only after a separate guard justifies it.

Do not add a full DOM walk to estimate depth, density, or subtree size for
every query. Do not build an array of feature values in the hot path when
scalar parameters suffice. Do not fetch both competing candidate universes
unless the timed cost still leaves a useful gain.

Make a table for every feature: source, availability stage, extra work,
mutation sensitivity, and fallback when unavailable. A model input must not
use the answer count, future route timing, fixture name, split label, or a
DOM fact obtained after the decision it is supposed to inform.

### F4. Measure headroom before training

For each family and host, compute:

1. Baseline time divided by the best complete legal alternative, in hindsight.
2. The same oracle restricted to groups indistinguishable under the proposed
   available features.
3. A version subtracting measured dispatch and inference cost from the saving.
4. A simple-rule comparison using the same facts and feature costs.

Equivalent actions should not create artificial oracle gains from independent
timing noise. Keep ties within measurement uncertainty on the baseline action.

If a family cannot pass the aggregate gate even with a free perfect chooser,
do not increase hidden units, training epochs, or dataset size to disguise
that limit. Change the available algorithm or acquisition cost first.

### F5. Training recipe

Use the pinned PyTorch environment. Reuse reviewed pieces from
`adaptive/data.py`, `adaptive/policy.py`, and `adaptive/train.py` where their
contracts actually match. Do not import their hardcoded six-action indexing
or old input domain into the new schema.

Start with one decision head per genuinely different action family. A shared
small hidden layer is optional after independent heads work. Invalid actions
must be masked, not selected and patched up after expensive preparation.

Recommended initial search, frozen before evaluation:

- Linear model, then 2, 4, and 8 ReLU hidden units.
- Three fixed seeds.
- Training-derived normalization and domain bounds only.
- Cost-sensitive action/ranking loss based on relative or normalized regret.
- Extra weight for mistakes exceeding the per-case regression limit.
- Zero or reduced weight for unresolved timing ties.
- Early stopping selected by measured validation query cost, not accuracy.
- Smaller model and fewer baseline overrides as tie breakers.

Report classification accuracy only as a diagnostic. Picking the faster
route on ten tiny queries does not compensate for a severe mistake on one
expensive query when the actual objective is total time.

Split by application/template family before collection. Keep related selectors,
near-duplicate DOMs, and both host measurements of a fixture in the same group.
Reserve unseen application/template groups for the final frozen decision.
The existing 68/86-case suites are development data and controls.

### F6. Export and integrate the exact model

Use scalar generated JavaScript, folded normalization, and static host inputs.
Avoid runtime feature arrays, generic tensor runtimes, model downloads, and
GPU dispatch for an individual synchronous selector query.

Save weights, checkpoint, normalization, domain bounds, numerical decision
band, action mask rules, training manifest, and emitted-source hashes.
Compare PyTorch and JavaScript on observed, boundary, out-of-domain, and seeded
random inputs. Explicitly cover unavailable inputs and invalid actions.

The exported fallback must be the current qualified planner, including its
eligibility gates and preflights. Python selection, JavaScript selection, and
benchmark forcing must agree on that contract. Do not repeat the historical
fallback mismatch.

Integrate the exact emitted model into full queries. Measure it against:

- Current qualified v3.
- Each always-used legal route.
- The best simple rule using the same available inputs.
- A compile-time-only choice where selector facts allow one.

A model must earn the cost of inference and feature acquisition. If it cannot,
keep the model offline and retain any independently justified compiler or
algorithm improvements. WebGPU is a separate batch/offline experiment only
after batching and transfer costs have their own positive headroom.

**F is done when:** useful route decisions have versioned data, a trained
real model has cross-language parity and integrated measurements, and its
runtime inclusion is either justified or explicitly rejected. Do not report
an offline network as a production feature.

## 11. Task G: show competitive gaps clearly

### Reproduction and comparison

Keep the unchanged baseline report. After freezing a retained candidate, run
the expanded survey against the same pinned competitor into a new file:

```sh
NWSAPI_REQUIRE_AC=1 node scripts/repo/run.mts scripts/repo/bench/survey/run.mts \
  --dependencies /tmp/nwsapi-audit-deps-20261003 \
  --output assets/repo/bench/selector-gaps-new/candidate-chromium.json \
  --power AC --expanded
```

Do not compare a new candidate/competitor ratio to the old October 3 ratio as
if that isolated the implementation change. Use the paired unchanged-build
comparison for causal attribution. The competition run answers a different
question: the current relative cost against that pinned library.

Add a `jsdom` competition runner or extend existing tooling with an explicit
host option. Measure each library through comparable APIs and record whether
the result is direct-engine or public host integration. Do not present a
direct-engine result as `document.querySelectorAll()` performance.

For especially thin gaps, prefer a three-variant rotating comparison:
unchanged v3, candidate v3, and the competitor in equivalent fresh contexts.
Check ordered results for all three. Keep at least one repeated pass so a
temporary competitor slowdown cannot masquerade as a candidate improvement.

### Report contents

Create a new saved HTML report under `assets/repo/bench/`. Serve it through the
existing Portless report host. Generate charts from recorded JSON inputs.
Use the existing atlas chart tools where appropriate. Avoid dot charts.

Required panels:

1. Candidate query time with unchanged v3 normalized to 100%. Lower is faster.
2. Absolute before/after/competitor time for the original thin-margin targets.
3. Newly exposed losses, including unresolved documentation cases.
4. Selector-family summaries with case counts and per-host separation.
5. Warm, cold, and mutation outcomes in separate panels.
6. Compiler/algorithm improvements versus model contribution, each supported
   by an ablation. Do not attribute a scalar code fix to learned inference.

Every chart needs a context paragraph below it. Include the fixtures, API,
host, power, rounds, exclusions, and whether cases are known development data.
Show both wins and regressions. Failed correctness rows get an error marker
and no performance bar.

For the gap table show:

```text
selector and fixture
unchanged v3 time
candidate v3 time
competitor time
candidate / unchanged time with interval
competitor / candidate time
absolute time saved
status: retained, rejected, unchanged, unresolved
```

Use root-relative links within the Portless site. A previous report had
repeated `atlas/atlas/...` breadcrumbs from relative URL handling. Verify
navigation from both the report and its nested atlas page.

## 12. Validation map and execution commands

Add behavior tests beside the owning implementation. The current type-union
candidate has passed focused checks; run broader qualification before landing.
Do not assert Markdown wording or entire generated source strings.

Existing relevant coverage to inspect and reuse:

- `test/repo/unit/selective-child-chain.test.mts`: logical type candidates,
  result order, uniqueness, scopes, callbacks, and density changes.
- `test/repo/unit/collection-snapshots.test.mts`: mutation-aware snapshots.
- `test/repo/unit/foreign-types.test.mts`: foreign names and routing.
- `test/repo/unit/selector-fast-paths.test.mts`: common fast paths.
- `test/repo/unit/first-compiled.test.mts`: first-result compilation.
- `test/repo/unit/logical-validation.test.mts`: logical parsing behavior.
- `test/repo/unit/disabled-complement.test.mts`: form-state complements.
- Existing ancestor, positional, adapter, and browser agreement tests.

Example focused command after execution/verification is authorized:

```sh
node scripts/repo/run.mts node_modules/vitest/vitest.mjs run \
  --config .config/repo/vitest.config.mts \
  test/repo/unit/selective-child-chain.test.mts \
  test/repo/unit/collection-snapshots.test.mts \
  test/repo/unit/foreign-types.test.mts \
  test/repo/unit/selector-fast-paths.test.mts \
  test/repo/unit/first-compiled.test.mts
```

Static checks, outside timing windows:

```sh
node node_modules/typescript/bin/tsc --project .config/tsconfig.check.json --noEmit
node scripts/repo/run.mts scripts/repo/lint.mts
node scripts/repo/run.mts scripts/repo/script-entrypoints/check.mts
git diff --check
```

Use `.config/oxfmt.json` when formatting selected files. Running `oxfmt`
without that config uses incompatible defaults. Avoid formatting unrelated
files in this worktree.

Before landing runtime changes, run the relevant broader unit/integration,
browser, modern/legacy, and WPT qualification required by the changed paths.
The current repository uses `pnpm run test:wpt`; the old historical
`node test/wpt/wpt-test.mjs` command from the conversation is not the current
v3 entrypoint. Preserve known expected failures and report new ones explicitly.

Do not claim that qualification suites have run unless the execution log
records their actual command and result. The complete `r2` benchmark checked
ordered results in both hosts.

## 13. Commit and handoff discipline

Suggested commit sequence, subject to actual retain/reject decisions:

1. Expanded benchmark coverage and auditable comparison tooling.
2. Qualified collection-copy reuse.
3. Qualified literal type-union guards.
4. Typed-position lookup improvement, if retained.
5. Scoped-union route and guards, if retained.
6. Narrow ancestor-reuse extension, if retained.
7. Form-state proof, if retained.
8. Multi-family model data/training/export experiments.
9. Model runtime integration only if it passes its separate gate.
10. Final measurements, charts, documentation, and phase statuses.

Keep exact baseline/candidate archives and generated model modules with the
benchmark artifacts. Some `.gz`, `.mjs`, `.pt`, and `.html` artifacts are
ignored by default. Force-add only the intended experiment files. Never add
`.cache`, environments, downloaded dependencies, or unrelated temporary files.

After each completed task record:

```text
Task:
Status: implemented / retained / rejected / deferred
Commit:
Changed runtime files:
Baseline and candidate hashes:
Measurement inputs and commands:
Correctness checks actually run:
Performance outcome by host and workload:
Cold/mutation/memory limitations:
Next task:
```

Check branch and status before every commit. Stage explicit paths so a
documentation commit does not accidentally land the unfinished runtime
experiment. Push only work the user has authorized and that has met its
declared completion criteria. Do not force-push or delete another worktree.

## 14. Current execution checklist

- [x] Finish and publish the prior neural continuation outcome through `abddf4c`.
- [x] Record an expanded 68-case unchanged-v3 Chromium comparison.
- [x] Implement two local experimental type-union changes.
- [x] Save the 86-case Chromium ablation pilot.
- [x] Complete the two-host `r2` run and save both result files.
- [x] Complete the reversed-order `r3` repeat on both hosts.
- [x] A: implement and land the empty-collection preflight candidate; record
      the Chromium AC repeat and its limits.
- [ ] A: repeat `jsdom` on AC power; finish cold, mutation, and retention
      checks and decide whether to keep each change.
- [ ] B: measure and improve query-local parent lookup for typed positions.
- [ ] C: measure and prototype exact scoped terminal-union execution.
- [ ] D: qualify ancestor-result reuse with a narrow pure logical suffix.
- [ ] E: evaluate a safe, shared form-state preflight.
- [ ] F: collect and train only on useful remaining multi-family decisions.
- [ ] G: publish the complete gap report and final qualification results.

**Next action:** repeat the refined candidate in `jsdom` on AC power. Record
the task A decision before starting task B.
