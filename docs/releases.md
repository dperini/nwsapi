# Releasing v2

The v2 workflow follows the Wheelhouse staged-publishing model: qualify the
package, reserve its version and artifacts, stage with GitHub OIDC, then approve
the verified bytes from a maintainer terminal. npm handles browser login and
proof of presence. No browser extension or long-lived CI npm token is needed.

## Contributor setup

Use Node 22.22.2+, 24.15.0+, or 26+ and pnpm 12.7.0. These are contributor-tool
requirements; the published selector engine keeps its existing syntax baseline.

```sh
pnpm install --frozen-lockfile
pnpm test
```

Installation runs `prepare`, which checks the pinned npm 12.1.0 release CLI and
sets up the pinned WPT checkout. `pnpm run setup` repeats both steps safely;
`pnpm run release:setup` checks just the release CLI. The pnpm lockfile replaces
the npm lockfile. The packaged manifest excludes contributor scripts and tools,
so installing a release does not clone WPT or install release tooling.

Install the [GitHub CLI](https://cli.github.com/) and sign in with repository
write access. For approval, sign in to an npm account with publishing access:

```sh
gh auth login
pnpm run npm:auth
```

## One-time repository and npm configuration

After this workflow reaches `master`, configure the `npm-publish` GitHub
environment to allow deployments only from the `master` branch. The workflow
needs permission to push a version commit and `v2.*` tag and create a draft
release. If branch rules block the Actions bot, grant the release workflow an
appropriate repository-approved path before dispatching it.

In [nwsapi's npm access settings](https://www.npmjs.com/package/nwsapi/access),
add or verify this GitHub Actions trusted publisher:

| Field | Value |
| --- | --- |
| Organization or user | `dperini` |
| Repository | `nwsapi` |
| Workflow filename | `publish-npm.yml` |
| Environment | `npm-publish` |
| Allowed action | Stage publishing |

Keep any v3 publisher configuration intact. The v2 workflow runs only on
`master`; the prerelease branch has its own workflow definition. Use npm's
normal account authentication to save these settings. Do not add an `NPM_TOKEN`
or `NODE_AUTH_TOKEN` secret: staging uses OIDC with isolated empty npmrc files.

## Qualify and stage

Test the next version locally without reserving or uploading anything:

```sh
pnpm run release -- dry-run
pnpm run release -- dry-run --release-as minor
```

Dispatch a qualification-only Actions run:

```sh
pnpm run npm:publish -- --dry-run
```

Dispatch a real staged patch release, or select an explicit v2 target:

```sh
pnpm run npm:publish
pnpm run npm:publish -- --release-as 2.3.0
```

The Actions UI also exposes **Stage npm v2 release**. Its `dry-run` input defaults
to `true`; uncheck it to stage. The CLI `npm:publish` command stages by default.
Both entrypoints always dispatch from `master`.

The workflow tests the source, packs only the runtime, README, license, and
sanitized manifest, then reruns the selector regressions against the tarball.
Before upload it advances the version in `package.json`, `bower.json`,
`build/VERSION`, `build/HEADER`, and the source header. An atomic push reserves
the version commit and tag. A draft GitHub release stores the exact tarball and
`release.json`, including the source commit, workflow run, and SHA-1/SHA-512.
The workflow then calls `npm stage publish --provenance` and saves the stage UUID.

Each stage consumes its version. An upload failure or rejection never permits
reuse. No npm package becomes public until approval.

## Verify and approve

Copy the version and stage UUID from the Actions summary. List stages with
`pnpm run npm:staged`. Substitute those exact values below:

```sh
pnpm run release -- verify 2.2.29 --stage <UUID>
pnpm run npm:approve -- 2.2.29 --stage <UUID> --dry-run
pnpm run npm:approve -- 2.2.29 --stage <UUID>
```

Approval checks the successful workflow run, reserved tag and commit, package
identity, dist-tag, and both tarball digests. It downloads the actual npm stage,
compares its files with the tagged source, and reruns the regression tests.
It rechecks the stage immediately before invoking npm's approval and 2FA flow.
It then verifies the public registry digests and publishes the GitHub release.

Once `latest` points to v3, pass `--tag v2` when staging a maintenance release.
The tool refuses to move `latest` from another major version back to v2. v2
GitHub releases are published with `--latest=false` to preserve the repository's
release ordering across major versions.

## Recovery

- A qualification failure has no remote side effects. Fix the failure and retry.
- If reservation succeeded but staging failed, inspect the run and npm staging
  before starting another release. Keep the reserved commit, tag, and draft.
  The next patch starts above the consumed version. Do not rerun an upload for
  that version.
- Reject an unwanted stage with
  `pnpm run release -- reject 2.2.29 --stage <UUID>`. This verifies the stage's
  identity and leaves its version reserved. Rejection also works when the
  original workflow failed after upload.
- If approval succeeded but registry propagation or GitHub finalization failed,
  run `pnpm run release -- finalize 2.2.29`. It verifies the public package against
  the saved hashes before finishing; it never uploads another package.
- If the stage UUID was not saved after upload, `pnpm run npm:staged` lists it.
  A failed staging run must be rejected and replaced with a new version rather
  than approved without successful workflow evidence.

Live OIDC and npm proof-of-presence require the one-time account configuration.
A dry run exercises packaging and regression checks without consuming a version.
