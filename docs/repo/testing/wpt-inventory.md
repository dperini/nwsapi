# Full-tree selector inventory

The inventory scans the WPT revision pinned in `.gitmodules`, including directories outside the normal sparse checkout. The current scan verifies 144,489 source files against their Git blob hashes and records 6,742 discovery candidates. It covers HTML, XHTML, XML, JavaScript, and module files. Images, media, fonts, and other binary resources are not selector source inputs.

The scanner uses text only to discover possible candidates. It parses JavaScript to count selector API calls, selector-validity helper calls, and calls nested inside assertions. It records testdriver dependencies and scripts it cannot parse. A selector call inside an assertion is not automatically a selector test. For example, a test can query a node and then compare its computed color. Queries used only to locate fixtures for an HTML parser, sanitizer, registry, or unrelated DOM API do not establish selector coverage. A retained assertion must check the selector result itself.

The HTML scan uses `parse5` without constructing browser windows or evaluating upstream scripts. Every scanned source must match the pinned Git tree. Missing or modified files stop the scan. The tracked [inventory](../../../test/repo/e2e/upstream/inventory.json) preserves source paths and blob hashes so later updates can be reviewed.

## Native support pool

The native support pool records the selector and parser assertions that pass in the pinned Chrome beta. It is separate from the engine suite below. A case entering this pool does not mean that `nwsapi` has passed it or that an engine adapter already exists.

<!-- native-summary:start -->

The finalized classification contains 14,734 selector-related cases across 571 URLs. It accounts for all 1,267,698 qualified native passes, with no unresolved cases. These are requirements inferred from native results, not engine compliance results.

Choose the timing for the operation you need. These estimates cover the native qualification stage. Dependency updates, installation, and other checks have their own costs.

| Operation                                                                             | Work performed                                                                           | Time to allow                                                                             |
| ------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Check unchanged inputs                                                                | Verify the committed contract. No discovery or browser tests run.                        | Under 1 second in local measurements.                                                     |
| Replay saved results with unchanged pins                                              | Rescan discovery and classify recorded results. Chrome stays closed.                     | About 1 minute in local measurements.                                                     |
| Resume after discovery adds candidates with unchanged pins                            | Run only URLs absent from the saved execution plans, then classify the combined results. | Replay time plus browser time for the added URLs.                                         |
| Refresh after a Chrome or WPT pin change, or when required cached results are missing | Qualify the full candidate pool.                                                         | About 33 minutes for browser work at this pool size, plus preparation and classification. |

Normal setup and checks use the committed pool. Missing temporary reports alone do not trigger a browser run. Regeneration needs matching saved reports or a full qualification run. The updater checks for this after dependency installation. A changed browser or WPT pin requires full qualification even when older reports remain cached.

<details>
<summary>Full qualification timing reference</summary>

The browser execution reference covers 11,278 URLs and totals 32 minutes 13 seconds with 4 workers on macOS ARM. It excludes checkout, browser installation, and classification. Use it for the full browser phase. It is not the duration of a routine check or cached replay. Hardware, load, candidate count, and timeout-heavy tests affect elapsed time.

</details>

| Category                      |     Cases | Treatment                                                 |
| ----------------------------- | --------: | --------------------------------------------------------- |
| Selector matching             |    11,865 | Retain the selector assertions.                           |
| Selector parsing              |     1,786 | Retain syntax assertions.                                 |
| Mixed selector callbacks      |     1,083 | Extract selector assertions from the other checks.        |
| Rendering                     |    78,267 | Exclude rendering assertions.                             |
| CSS property values and CSSOM |    32,711 | Exclude assertions outside selector parsing and matching. |
| Other APIs and fixture setup  | 1,141,986 | Exclude assertions that do not test selector results.     |

<!-- native-summary:end -->

### Commands

Run the full discovery and qualification process with:

```sh
pnpm run test:wpt:native
```

The command prints its artifact directory under `os.tmpdir()`. It uses a full, pristine WPT checkout at the pinned revision. To inspect progress or replay a completed run, use that directory:

```sh
pnpm run test:wpt:native:status --directory <directory>
pnpm run test:wpt:native --analyze --directory <directory>
pnpm run test:wpt:native --resume --directory <directory>
pnpm run check:wpt-native-contract
```

Replay rescans discovery, reads the recorded browser results, and reruns classification. It does not open Chrome. If discovery finds URLs that were not recorded, replay stops and names the resume command. Resume runs those URLs, preserves the original reports, and combines their qualified results. It does not rerun completed URLs. If the temporary directory has been removed or either pin changed, start a fresh native run.

### Discovery and classification

1. The discovery script reads the full upstream manifest. It normalizes URL variants and maps them to source files. It uses specification links, selector API calls, validity helpers, and script dependencies to choose candidate testharness pages before starting Chrome. Reference-image tests are outside this candidate list.
2. Chrome runs the generated candidate list. The execution plan and browser invocation use the same selection. WPT experimental feature overrides are removed. The runner records both page outcomes and named subtest outcomes.
3. Qualification checks the browser version, WPT revision, completed report, and every planned result. A failing harness cannot contribute passing subtests. A retry cannot hide an earlier failure. Skips, timeouts, errors, and failed cases stay outside the passing pool.
4. Inference parses HTML, XML, and JavaScript. It reads CDATA as XML, follows explicit script dependencies, recognizes forwarded iframe tests, and finds literal URLs and inline code assigned to script elements. Import maps remain data. WPT server placeholders become neutral scalars for static analysis. Their request values are never evaluated.
5. The script follows selector results through local variables, collection transformations, helper parameters, and helper return values into assertions. It recognizes selector method aliases, reversed constant comparisons, implicit no-throw parsing checks, and selector comparisons forwarded by resolved frames. A selector used only to find a fixture or an expected value does not make the assertion a selector test. Generated names are matched using fixed text from their AST expressions. Deferred callbacks, callback-free asynchronous registrations, and WPT default names use separate rules. JavaScript source is not classified with regular expressions.
6. Every qualified native pass receives a category. Each page records category counts, source locations, reasons, and sample names. Parser and matching cases enter the support pool. Mixed cases record that their selector assertions must be extracted from rendering or CSSOM checks. Rendering, CSS property values, and other API assertions are excluded.

The standard WPT selector-validity helper contains both syntax and CSSOM checks. Its pool entry preserves the syntax requirement. An engine adapter must drop serialization checks instead of treating the whole original callback as a selector requirement. The same restriction applies to mixed pages that need browser interaction or another host API to construct their fixtures.

The classifier does not evaluate upstream tests during replay. Unknown source forms stay unresolved when they prevent a scope decision. A finalized report closes classification of this recorded candidate run. It does not prove that static analysis can discover every indirect selector assertion in all JavaScript programs.

### Tracked artifacts and enforcement

The generated [summary](../../../assets/repo/bench/wpt-native-summary.json) records the pins, measured duration, category totals, input hashes, and inference fingerprint. The [support pool](../../../assets/repo/bench/wpt-native-support.json) records the exact case names and their selector requirements. The [category report](../../../assets/repo/bench/wpt-native-categories.json) accounts for the complete passing pool by page, with source evidence. Raw browser events and the full native report stay in the temporary artifact directory.

The [documentation generator](../../../scripts/repo/gen/wpt-native-summary.mts) refreshes the summary from recorded data. Prose changes do not invalidate native results.

The [contract check](../../../scripts/repo/check/wpt/native-contract.mts) runs as part of `pnpm run check`. It rejects unresolved cases, unknown categories, incomplete totals, an empty support pool, altered generated artifacts, and stale browser, WPT, inference, or dependency inputs. Category totals must account for every qualified native pass exactly once. Eligible totals must match the support case count. The writer refuses to replace the tracked contract while any scope decision remains unresolved. Replay also refuses to finalize when the current discovery contains URLs absent from the recorded execution plans. Regression tests read pinned WPT fixtures for method aliases, transformed collections, direction helpers, and syntax acceptance. These prevent a zero-unresolved total from hiding known selector cases in other categories.

After `pnpm run update` installs dependencies, [the native updater](../../../scripts/repo/update/native.mts) checks this contract. It resumes available reports only when both pins match. Without matching reports, it starts a fresh candidate run. New candidate URLs run before their reports are combined. When every candidate already has a recorded result, only classification runs. An unresolved new case fails finalization and leaves the previous tracked contract intact. Update the inference rule and its regression test, then replay the saved run. Review the generated support-pool diff alongside the source evidence before committing it.

## Selector grammar coverage

The full-tree scan found 45 substantive sources that call the standard upstream selector-validity helpers. All 45 now run through the installed selector APIs. Another 32 focus-interaction pages repeat the already covered `:focus-visible` validity input. Their rendering and testdriver checks are excluded. The shared helper implementation itself is not counted as a test page.

The validity lane has 48 pages. Alongside those 45 sources, it includes the embedded `An+B` helpers and two adapted `CSS.supports()` pages for picker and details-content selectors. Those two pages have directly transferable grammar expectations. The adapters retain the upstream booleans and use CSS tokenization to extract the selector from its support condition. Each input is checked through eight installed query, matching, and closest methods, including empty element and fragment contexts.

Other `CSS.supports(selector(...))` tests cannot be copied wholesale into DOM selector validation. Support conditions reject selector lists and reject unsupported branches even where `:is()` and `:where()` use forgiving parsing. Those expectations differ from `querySelectorAll()` acceptance. The inventory retains those sources for review. Native CSSOM serialization, stylesheet application, specificity, cascade, layout, paint, and screenshot comparisons stay outside this suite.

## Matching coverage and exclusions

The full-tree review added custom-element defined states and custom states, form-associated custom controls, shadow-tree query boundaries, nested shadow focus, CDATA direction changes, slot reassignment, language inheritance, disabled option wrappers, quirks-mode adoption, target reinsertion, and popover state changes. Named-test adapters retain selector assertions from mixed pages and reject unexpected changes to the test counts or selected names. Narrow AST edits remove computed-style checks without changing selector expectations.

The new [selection](../../../test/repo/e2e/upstream/selection.mts) records each admitted page and its adaptation. Existing matching pages remain in [the main manifest](../../../test/repo/e2e/upstream/manifest.mts). Fixtures and prerequisite assertions are retained where they establish the DOM state being queried. Unrelated standalone tests are excluded from mixed pages.

The 190-page suite runs 7,877 subtests. Of these, 7,793 pass. The 84 known failures belong to two newly admitted draft heading-offset pages. The host lacks draft property reflection, and the engine does not implement offset/reset matching. Those failures remain explicit in the summary and expectations rather than being skipped or reported as passes.

The release also adds pointer-driven `active-inside-link.html` and `hover-boundary-events.html`. Their selector assertions are relevant, but they require a testdriver action bridge that this runner does not provide. They remain explicit review candidates. The new cue and universal-highlight parsing pages are admitted, with eight inputs each.

The following sources remain outside the selected suite:

- Reftests, rendering assertions, CSSOM serialization, style invalidation, and tests with no harness assertions require a different runner or test a different layer.
- Testdriver interaction, permissions, fullscreen activation, and cross-origin infrastructure need host setup beyond this runner. Programmatic focus and state changes can run when their assertions only inspect selectors.
- HTML parsing, sanitization, custom-element construction, event dispatch, and collection APIs are excluded when selectors only locate or inspect their fixtures.
- Media state tests retain their separate media lane and its resources. They are not counted twice in this summary.
- Native aliases such as `webkitMatchesSelector` remain excluded because the engine does not replace them.
- Unparsed scripts and unresolved dynamic helper paths block native finalization when they prevent a scope decision. Discovery does not prove that every possible indirect selector assertion has been identified.

This is a full source inventory and an expanded selector suite. It is not a claim of complete WPT or CSS conformance.

## Updating the inventory

Run `pnpm run update` to resolve the latest published WPT release and pin its tag to an exact commit. The update refreshes the Git tree hash, sparse checkout, full source inventory, and candidate inventory before dependency installation runs its setup hook. `pnpm run update --check` reports the latest release without changing the checkout. WPT releases are selected when the command runs, independently of the npm dependency maturity delay. A failed release lookup stops the update rather than falling back to a moving branch.

For a WPT-only update, run `node scripts/repo/update/wpt.mts`. The current release is [`merge_pr_62589`](https://github.com/web-platform-tests/wpt/releases/tag/merge_pr_62589), which resolves to `fd983776a7cd19ebcda7a2bcb69c74330ee5d8c9`.

To rebuild inventories for an already pinned checkout, run:

```sh
pnpm run check:wpt-inventory --fetch --write
pnpm run check:wpt-candidates --write
```

The first command downloads the pinned archive under `os.tmpdir()`, scans it, and removes the temporary checkout. It requires `curl` and `tar`. To reuse a full checkout or extracted archive at the exact revision, use:

```sh
pnpm run check:wpt-inventory --source /path/to/full/wpt --write
```

Review the inventory diff, new helper calls, unparsed scripts, and changed candidate assertions. Update the manifest or document exclusions. Update sparse paths in `.gitmodules` when admitted pages need new directories. For an existing checkout, apply them with `node scripts/repo/git-partial-submodule.mts restore-sparse upstream/wpt`. For a missing checkout, run `pnpm run upstream:clone`. Run modern and legacy WPT and regenerate the tracked summary as described in [upstream testing](upstream.md).

Normal setup only checks the recorded revision and sparse candidate inventory. It does not download or parse the full WPT tree on every install. A new pin fails that check until the full inventory is regenerated and reviewed.
