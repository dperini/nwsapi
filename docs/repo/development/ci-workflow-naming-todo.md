# GitHub Actions workflow naming follow-up

## Align names across branches

- [ ] Give the primary validation workflow the same descriptive name on
  `master` and `prerelease/3.0.0`. Use the SocketDev style, such as
  [`ci: gates`](https://raw.githubusercontent.com/SocketDev/socket-lib/main/.github/workflows/ci-gates.yml),
  instead of `nwsapi` or `nwsapi maintenance`.
- [ ] Use a matching run-name pattern that includes the branch, so runs remain
  easy to tell apart when both branches update.
- [ ] Give coverage and release workflows clear task names. Follow patterns
  such as [`publish: npm`](https://raw.githubusercontent.com/SocketDev/socket-lib/main/.github/workflows/publish-npm.yml)
  and use a matching `ci:` prefix for coverage.
- [ ] Check all workflow names shown on the Actions page on both branches.
  Keep branch-specific workflows descriptive and use the same name for the
  same kind of work.

SocketDev's [`socket-lib` workflows](https://github.com/SocketDev/socket-lib/tree/main/.github/workflows)
use short category-and-task names, including `ci: gates`, `ci: fix`,
`publish: npm`, and `nightly: npm`.
