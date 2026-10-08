# V3 quality review: October 7, 2026

Reviewed `prerelease/3.0.0` at `181e31f77baad4606c081b354db93a79427ee33c` in a detached checkout. The review excludes concurrent, uncommitted guide edits. It has three passes: runtime correctness, build and package behavior, and test coverage and reproducibility.

## Findings

### P1: fresh dependency installation fails its build policy

`pnpm-workspace.yaml:1` lists explicit dependency build decisions and enables `strictDepBuilds`. The new narration dependencies introduce `onnxruntime-node` 1.21.0 and `sharp` 0.34.5 without corresponding decisions.

A fresh directory containing the committed manifest, workspace configuration and lockfile fails `pnpm install --offline --frozen-lockfile` with `ERR_PNPM_IGNORED_BUILDS`, naming those two packages. Root lifecycle scripts were removed only for this isolated probe. Dependency scripts and the build policy remained enabled. This blocks the normal setup and CI installation before their checks run.

Add explicit decisions for both dependencies after reviewing which native functionality the guide needs. An installation performed with `--ignore-scripts` does not exercise this gate.

### P2: the missing-Map fallback leaves one cache using Map

`src/core/initialize/api.mts:279` replaces caches after registering legacy hooks on a host without `Map`, but omits `siblingDeclined`. Its allocator still calls `new engine.primordials.MapCtor` in `src/core/cache/plan.mts:51`.

Reproduction: load the built engine and legacy extension in a VM with `Map` and `WeakMap` undefined, retain `String.prototype.includes`, and give the engine a quirks-mode HTML document containing two paragraphs. `select('p ~ p', document)` throws `TypeError: engine.primordials.MapCtor is not a constructor`. The same query on a standards-mode document succeeds. The quirks-mode sibling optimization declines the query and writes into the missed cache.

Replace `siblingDeclined` with the legacy allocator alongside the other caches. Cover missing collections independently from the flag that switches DOM readers. The existing missing-builtins fixture also removes `String.prototype.includes`, enabling `LEGACY` and skipping the failing optimization.

### P2: narration unit tests perform real model loading

`scripts/repo/gen/guide/narration.mts:219` now initializes an aligner. The generator tests inject a speech engine and command runner, but omit the new `align` dependency, for example at `test/repo/unit/gen/guide/narration.test.mts:168`.

Three unit tests attempt to load the alignment model from Hugging Face and fail with HTTP 501 under the unit network guard. Inject a fake aligner with deterministic word cues so these tests exercise composition and cleanup without loading an inference model.

Two other unit assertions are stale: narration expects the former spelled-out package pronunciation at `test/repo/unit/gen/guide/narration.test.mts:124`, and the motion test expects the former `Pause forward` accessible label at `test/repo/unit/perf/pytorch-has-routing/motion.test.mts:226`. Preserve the requested pronunciation and current accessible behavior when updating the assertions.

### P2: the clean type-check fixture omits required JSON assets

`test/repo/integration/typecheck-clean.test.mts:33` copies sources and configuration into its clean fixture but omits `assets/repo/model-guide/narration/*.json`. Those assets are imported by the narration implementation and tests.

The integration test fails with TS2307 for `transcript.json` and `timings.generated.json`, plus a consequent implicit-any error. The normal repository type check passes. Include the required tracked inputs in the fixture so the check still measures independence from generated JavaScript and incremental caches.

### P2: committed pronunciation code fails lint

`scripts/repo/gen/guide/pronunciation.mts:5` calls `.sort()`, which violates the configured `unicorn/no-array-sort` rule. `pnpm run lint:check` fails on this line, and the clean-lint integration test reports the same failure. Use `.toSorted()`.

## Known unresolved performance issue

Issue #242 remains relevant. The [recorded cache scan](../perf/selector-cache-scan-outcome.md) shows 23,000 misses and compiled-function insertions over 23,000 measured calls for a repeated scan of 2,300 complex selectors on v3. The relevant runtime code is unchanged in this reviewed revision. This is previously recorded evidence, not a new benchmark from this review.

## Three-pass results

| Pass | Checks | Result |
| --- | --- | --- |
| Runtime correctness | Unit suite, cache and context source review, targeted missing-Map reproduction | 2,250 unit tests passed and 5 failed. The missing-Map crash was independently reproduced. |
| Build and package behavior | Runtime build, guide production build, packed consumer interoperability, fresh dependency installation | Builds passed. Package interoperability passed on Node.js 22.23.2, 24.21.0 and 26.11.0. Fresh installation failed its dependency build policy. |
| Coverage and reproducibility | Integration suite, type check, lint, naming, catalog and schema checks | 223 integration tests passed, 2 failed and 1 was skipped. Type, naming, catalog and schema checks passed. Lint failed. |

The documented `pnpm test` command was also attempted and terminated at its 10000ms whole-lane budget before printing test results. The unit counts above come from invoking the same Vitest configuration directly without that outer deadline. This is a local gate observation, not a timing comparison against another revision.

The first isolated runs lacked the pinned WPT fixture and external tool cache. Both were attached from the existing workspace and the affected suites were rerun. Their initial missing-file failures are excluded from the findings and final counts.

This review did not run the complete upstream WPT or browser matrix, a full coverage collection, or a fresh performance benchmark. Passing package and unit checks therefore do not establish complete browser conformance.
