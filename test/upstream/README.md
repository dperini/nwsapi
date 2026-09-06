# WPT runner

See [setup and baseline maintenance](../../docs/upstream.md).

`manifest.mts` selects the pages. `sections.mts` maps subtests to upstream
selector sections. `wpt.spec.mts` installs nwsapi, collects testharness results,
and compares failures with `expectations.json`.
