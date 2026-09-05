# WPT runner

See [setup and baseline maintenance](../../docs/upstream.md).

`manifest.mjs` selects the pages. `sections.mjs` maps subtests to upstream
selector sections. `wpt.spec.mjs` installs nwsapi, collects testharness results,
and compares failures with `expectations.json`.
