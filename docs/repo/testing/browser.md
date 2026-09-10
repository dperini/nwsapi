# Browser discovery and pinning

Run `pnpm run update` to refresh dependencies, the WPT release, and Chrome. Run `pnpm run update --check` to preview them without changing the checkout. For Chrome alone, use `pnpm run update:chrome`, optionally with `--check`.

The [Chrome updater](../../../scripts/repo/update/chrome.mts) reads Google's [last-known-good channel metadata](https://googlechromelabs.github.io/chrome-for-testing/last-known-good-versions-with-downloads.json). This feed reports stable and beta versions with their available Chrome for Testing downloads. The script checks both version strings and download entries for Linux x64, macOS ARM64 and x64, and Windows x64. Missing downloads, invalid metadata, or a failed request stop the update. It does not silently choose an older browser or the bundled Playwright browser.

The updater records both channels, the feed timestamp, and the selected beta version in [the browser pin](../../../.config/chrome.json). It then installs that exact beta build outside the checkout. Normal setup, tests, and CI read the committed pin without rediscovering the channels. The shared launcher checks the executable version before reuse. This keeps a checked-out revision reproducible even when Google publishes another beta.

Beta is the regular test target for current selector parsing and matching. Standards and features available in stable remain in scope. Beta is not proof that every stable behavior is unchanged, so existing regression cases remain. Experimental command-line feature flags are not added. Browser rendering and CSSOM serialization are outside this selector suite.

After a browser update, run modern and legacy WPT, browser regressions, and coverage checks. Regenerate the WPT summary from the new run. Existing performance reports keep their measured browser versions until their benchmarks are rerun.

## Native selector qualification

Use the [timing guidance for your operation](wpt-inventory.md#native-support-pool). An unchanged contract needs a short verification. Saved-result replay does local analysis, and resume runs only newly discovered URLs. A browser or WPT pin change requires full candidate qualification. Its browser time is separate from checkout, downloads, and analysis.

`pnpm run update` checks the native support contract after dependency installation. If the browser or WPT pin changed, it runs candidate discovery and browser qualification. If only inference code or dependencies changed, it reuses saved native reports when they still exist and both pins match. It rescans discovery and runs any newly discovered URLs before classification. `pnpm run update --check` reports the required work without starting browser tests.

See [the native support pool process](wpt-inventory.md#native-support-pool) for discovery rules, classification, generated reports, replay commands, and the checks that enforce finalization.

Chrome uses its default beta feature set. The generated launcher removes WPT feature overrides while preserving the debugging pipes required by ChromeDriver. Rendering assertions do not become selector requirements. Mixed cases retain a requirement to extract only their selector assertions.
