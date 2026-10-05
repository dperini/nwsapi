# GitHub Actions workflow naming follow-up

## Align names across branches

- [ ] Give the primary validation workflow the same descriptive name on
  `master` and `prerelease/3.0.0`. Use the SocketDev style, such as
  [`ci: gates`](https://raw.githubusercontent.com/SocketDev/socket-lib/main/.github/workflows/ci-gates.yml),
  instead of `nwsapi` or `nwsapi maintenance`.
- [ ] Set `name` and `run-name` to the same short task label for ordinary CI
  runs. SocketDev uses `ci: gates` for both; it does not add the repository or
  branch name to that label.
- [ ] Give coverage and release workflows clear task names. Follow patterns
  such as [`publish: npm`](https://raw.githubusercontent.com/SocketDev/socket-lib/main/.github/workflows/publish-npm.yml)
  and use a matching `ci:` prefix for coverage.
- [ ] Add a short `run-name` suffix only when an event needs context, such as a
  release channel or dispatched revision.
- [ ] Check all workflow names shown on the Actions page on both branches.
  Keep branch-specific workflows descriptive and use the same name for the
  same kind of work. Keep workflow filenames descriptive where that helps
  identify their purpose in the repository.

SocketDev's [`socket-lib` workflows](https://github.com/SocketDev/socket-lib/tree/main/.github/workflows)
use short category-and-task names, including `ci: gates`, `ci: fix`,
`publish: npm`, `nightly: npm`, and `sweep: jobs`. Its CI gate sets the same
label for `name` and `run-name`; publishing workflows add event details when
those details help identify a particular run.
