# Four-pass quality review

Reviewed 12 October 2026. The v3 review started at `3fe497f` on
`prerelease/3.0.0`. The v2 review started at `ffe3bad` on `master` in a
separate temporary worktree. Each branch received four review loops. An
independent reviewer challenged the fixes before integration.

## Loops and findings

| Loop                                 | v3                                                                                                                                                                              | v2                                                                                                                                                  |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Runtime and baseline              | Cache and CLI regressions passed. Found radio group matching failures and a `:target` exception in documents without a location.                                                | Found the same selector failures. Setup inspection also found that `clean` removed shared npm and browser caches.                                   |
| 2. Failure and recovery              | Fixed cancelled tasks returning success and narration continuing after cancellation. Corrupt tool archives now trigger a new download of the same pinned release.               | Corrupt cached tool archives previously blocked every setup retry. Recovery now fetches and verifies the pinned release again.                      |
| 3. Workflow and usability            | Exercised Clear/Undo, mobile contents, Escape, heading focus, copy retry, and stable reader geometry in Chromium. Reviewed task discovery, terminal fallback, and cancellation. | Reviewed setup, cleanup, radio form ownership, detached trees, and repeated matching. Found that the declared lint command had no installed linter. |
| 4. Adversarial review and regression | Found late cancellation and evidence-write cleanup gaps. Added mocked regressions before the final checks.                                                                      | Found that cleanup followed a `dist` symlink outside the checkout. Added an isolated sentinel test and a guard.                                     |

Radio matching compares names directly, without interpolating them into a
selector. Coverage includes spaces and quotes, unchecked lone radios,
separate forms, externally associated form controls, detached trees, and
shadow roots. The rules follow the [HTML radio group definition](<https://html.spec.whatwg.org/multipage/input.html#radio-button-state-(type=radio)>)
and [indeterminate matching](https://html.spec.whatwg.org/multipage/semantics-other.html#selector-indeterminate).

Archive recovery never accepts the corrupt bytes, changes a pin, or skips
checksum verification. Nonregular cache entries and unrelated filesystem
errors remain failures. Tests use temporary directories and mocked requests.

## Verification

The Chromium docs suite passed all 12 tests at 320px and 1440px, including
light and dark appearance. The eight axe scans reported no violations.
Catalog gradient contrast still produces incomplete results requiring manual
review. These checks do not establish complete accessibility conformance.

Focused v3 cache, configuration, and CLI checks passed 45 tests across nine
files. Five focused docs unit suites passed 37 tests. Archive verification
and recovery passed 10 tests. The target-location regression and legacy DOM
suite passed 35 tests.

The final v3 `pnpm run review` passed lint, formatting, types, and 2,505 unit
tests across 414 files in 32 shards. Script-entrypoint and naming checks also
passed. The independent reviewer caught a startup-handshake ordering
regression during the fixes. Its correction includes an ordering assertion.

V2 passed all 137 tests and its restored lint command. The linter also caught
an undefined helper name in class lookup with `NODE_LIST` enabled, now fixed
with a regression test. Pinned `eslint`, `@eslint/js`, and `globals` support
a maintained correctness-focused configuration without restyling the legacy
source.

V2 [PR #247](https://github.com/dperini/nwsapi/pull/247) contains one commit.
Its Node 22, Node 24, and browser compatibility CI jobs passed. The completed
v3 agent worktree was removed after confirming merge ancestry and inspecting
ignored output. The v2 worktree is retained while its PR awaits merge.

## Boundaries

VoiceOver, browser ownership, signals, and permission actions in unit tests
use fake adapters. This pass did not start native narration or change system
permissions. Actual spoken output remains unverified.

The review did not produce new performance measurements. Passing cache
regressions is correctness evidence, not a throughput claim. The selector
changes cover the stated cases, not all fragment-navigation semantics.

Existing v2 PRs #245 and #246 remain independent. The new v2 fixes are based
on current `master` and are proposed separately.
