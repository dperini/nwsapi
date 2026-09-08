# WPT runner

See [setup and baseline maintenance](upstream.md).

Runner files live under `test/repo/e2e/upstream/`.

`manifest.mts` selects the pages. `sections.mts` maps subtests to upstream
selector sections. `wpt.spec.mts` installs nwsapi, collects testharness results,
and compares failures with `expectations.json`.
