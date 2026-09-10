# Browser discovery and pinning

Run `pnpm run update` to refresh dependencies, the WPT release, and Chrome. Run `pnpm run update --check` to preview them without changing the checkout. For Chrome alone, use `pnpm run update:chrome`, optionally with `--check`.

The [Chrome updater](../../../scripts/repo/update/chrome.mts) reads Google's [last-known-good channel metadata](https://googlechromelabs.github.io/chrome-for-testing/last-known-good-versions-with-downloads.json). This feed reports stable and beta versions with their available Chrome for Testing downloads. The script checks both version strings and download entries for Linux x64, macOS ARM64 and x64, and Windows x64. Missing downloads, invalid metadata, or a failed request stop the update. It does not silently choose an older browser or the bundled Playwright browser.

The updater records both channels, the feed timestamp, and the selected beta version in [the browser pin](../../../.config/chrome.json). It then installs that exact beta build outside the checkout. Normal setup, tests, and CI read the committed pin without rediscovering the channels. The shared launcher checks the executable version before reuse. This keeps a checked-out revision reproducible even when Google publishes another beta.

Beta is the regular test target for current selector parsing and matching. Standards and features available in stable remain in scope. Beta is not proof that every stable behavior is unchanged, so existing regression cases remain. Experimental command-line feature flags are not added. Browser rendering and CSSOM serialization are outside this selector suite.

After a browser update, run modern and legacy WPT, browser regressions, and coverage checks. Regenerate the WPT summary from the new run. Existing performance reports keep their measured browser versions until their benchmarks are rerun.
