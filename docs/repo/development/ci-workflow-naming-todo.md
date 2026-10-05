# GitHub Actions workflow naming follow-up

## Align names across branches

- [x] Give the primary validation workflow the same descriptive name on
  `master` and `prerelease/3.0.0`. Use the SocketDev style, such as
  [`ci: gates`](https://raw.githubusercontent.com/SocketDev/socket-lib/main/.github/workflows/ci-gates.yml),
  instead of `nwsapi` or `nwsapi maintenance`.
- [x] Set `name` and `run-name` to the same short task label for ordinary CI
  runs. SocketDev uses `ci: gates` for both; it does not add the repository or
  branch name to that label.
- [x] Give coverage and release workflows clear task names. Follow patterns
  such as [`publish: npm`](https://raw.githubusercontent.com/SocketDev/socket-lib/main/.github/workflows/publish-npm.yml)
  and use a matching `ci:` prefix for coverage.
- [x] Add a short `run-name` suffix only when an event needs context, such as a
  release channel or dispatched revision.
- [x] Confirm the new names appear on workflow runs for both branches. The CI
  name is `ci: gates` on both branches; v3 coverage is `ci: coverage`; v2 and
  v3 releases use `publish: npm`, with the release channel in `run-name`.
  GitHub's stale, unreferenced `Coverage` workflow entry was disabled after
  moving the file to `ci-coverage.yml`.

The primary CI file is `.github/workflows/ci.yml` on both branches. V3
coverage uses `.github/workflows/ci-coverage.yml`; both release flows use
`.github/workflows/publish-npm.yml`. The descriptive filenames now match
across branches where the workflow has the same purpose.

SocketDev's [`socket-lib` workflows](https://github.com/SocketDev/socket-lib/tree/main/.github/workflows)
use short category-and-task names, including `ci: gates`, `ci: fix`,
`publish: npm`, `nightly: npm`, and `sweep: jobs`. Its CI gate sets the same
label for `name` and `run-name`; publishing workflows add event details when
those details help identify a particular run.
