# Track selector performance with tak

`tak` records the elapsed time of a command and attaches the result to a Git
commit. This repository uses it as an extra way to follow Node.js selector
performance across commits. The existing selector and browser benchmarks
remain the main tools for measuring query time.

## What the trial measures

The `node_selectors` benchmark starts a fresh Node.js process for each sample.
It creates the same jsdom document, runs one selector 1,500 times, checks the
ordered results, and exits. The three workloads cover a class match, a child
and descendant path, and `:has()`:

- `simple`: `.item.active`
- `descendant`: `main .card > .item.selected`
- `has`: `.card:has(> .item.active)`

Each workload uses 64 cards with eight items per card. `tak` runs 12 samples
after two warmups. The recorded time includes process startup, fixture
creation, and all 1,500 queries. That makes the test easy to repeat, but it
also means it is less precise than an in-process query benchmark.

The trial records elapsed time only. It does not enable Valgrind instruction
counts because a Node.js workload includes V8 startup and JIT compilation.
Wall-clock results are informational and do not fail CI. Check an apparent
change with the selector and browser benchmarks before drawing conclusions.

## GitHub Actions

The `perf: tak` workflow runs these workloads after each push to
`prerelease/3.0.0`. The measurement job has read-only repository access. A
separate job checks the exported result against the pushed commit and publishes
it to `refs/notes/tak`. The publisher uses the pinned tak release binary and
does not run package scripts. This keeps write access away from the benchmark
process.

The workflow reports measurements; it does not reject a commit for a timing
change. GitHub Actions runners can vary, so use the trend to spot changes and
rerun the repository's more detailed benchmarks before making performance
claims.

CI restores `.cache/external-tools`, `.cache/nub`, and the pnpm content-
addressed store through `.github/actions/repo/cache-tools`. The cache key
includes the operating system, architecture, lockfile, and external-tool
manifest. `node_modules` is not cached; pnpm still installs and links the
locked dependency graph on every run.

## Run and save measurements

Use the pinned `tak` binary and build the package before running:

```sh
pnpm run bench:tak
```

To attach the measurements to the current commit in the local Git notes:

```sh
pnpm run bench:tak:record
```

Push those notes to the repository so another checkout can read them:

```sh
pnpm run bench:tak:push
```

Show the latest measurements for each workload:

```sh
pnpm run bench:tak:history
```

Record each commit you want to compare, using the same machine and Node.js
version. `tak` keeps the measurements in `refs/notes/tak`; they do not change
the source tree or the commit hash. The tool fetches remote notes for history
commands and can compare recorded commits. Keep measurements from different
machines or operating systems in separate runner classes.

## Tool pin

The repository pins `tak` and its release checksums in
`.config/external-tools.json`. `pnpm run setup:tak` verifies and installs the
matching release binary. Because this is a GitHub release binary rather than
an npm dependency, pnpm's package release-age exception does not apply.

`tak` is pre-v1 software, so its command line and Git note format may change.
See the upstream [methodology](https://tak.jdx.dev/guide/methodology) and
[CI and Git notes guide](https://tak.jdx.dev/guide/ci) before changing how the
repository records or compares results.
