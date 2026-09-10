# Full-tree selector inventory

The inventory scans the WPT revision pinned in `.gitmodules`, including directories outside the normal sparse checkout. The current scan verifies 144,489 source files against their Git blob hashes and records 6,742 discovery candidates. It covers HTML, XHTML, XML, JavaScript, and module files. Images, media, fonts, and other binary resources are not selector source inputs.

The scanner uses text only to discover possible candidates. It parses JavaScript to count selector API calls, selector-validity helper calls, and calls nested inside assertions. It records testdriver dependencies and scripts it cannot parse. A selector call inside an assertion is not automatically a selector test. For example, a test can query a node and then compare its computed color. Queries used to check an HTML parser, sanitizer, registry, or unrelated DOM API also do not establish selector coverage.

The HTML scan uses `parse5` without constructing browser windows or evaluating upstream scripts. Every scanned source must match the pinned Git tree. Missing or modified files stop the scan. The tracked [inventory](../../../test/repo/e2e/upstream/inventory.json) preserves source paths and blob hashes so later updates can be reviewed.

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
- Unparsed scripts and dynamic helper paths remain review candidates. Discovery does not prove that every possible indirect selector assertion has been identified.

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
