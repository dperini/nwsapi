# Staged v3 releases

`pnpm run release --help` describes the release commands. Use the version intended for publication. Examples below use `3.0.0-beta.1` only as a placeholder. The request in `.config/release-request.json` stays disabled until preparation records a version.

## Configure publishing

Run these commands from a maintainer terminal with GitHub repository administration access and npm package ownership:

```sh
pnpm run release login
pnpm run release trust
pnpm run release trust --apply
```

The trust command creates the `publish-npm-v3` GitHub environment restricted to `prerelease/3.0.0`. It establishes a stage-only npm publisher for `dperini/nwsapi` and `publish-npm.yml`. It verifies the replacement before revoking stale bindings for that environment. Maintenance publishers and existing review rules are preserved. Unexpected broad environment policies require correction before reconciliation can continue. npm may request browser authentication or a one-time password.

## Reserve and stage

Start from a clean, pushed `prerelease/3.0.0` checkout whose latest CI and coverage runs passed. Configure Git signing first.

```sh
pnpm run release prepare 3.0.0-beta.1
pnpm run release prepare 3.0.0-beta.1 --apply
```

Preparation creates a signed commit and signed `v3.0.0-beta.1` tag, then atomically pushes both. Existing local tags, remote reservations, and published versions cannot be reused. The request-file push starts the inline publishing workflow. CI verifies source, security, coverage, package interoperability, and the fuzz corpus. It uploads a GitHub prerelease containing the exact tarball and its SHA-512 receipt before calling `npm stage publish` through OIDC. The stage UUID appears in the workflow summary.

The workflow uses `next` and never moves `latest`. A disabled request skips the publishing job entirely. The workflow also supports manual dispatch once GitHub exposes it. No CI job approves a stage.

## Verify and approve

Use the exact signed release checkout, with no local changes:

```sh
git fetch origin --tags
git checkout --detach v3.0.0-beta.1
pnpm install --frozen-lockfile
pnpm run release verify 3.0.0-beta.1 --stage STAGE_UUID
pnpm run release approve 3.0.0-beta.1 --stage STAGE_UUID
pnpm run release approve 3.0.0-beta.1 --stage STAGE_UUID --apply
```

Verification compares the actual GitHub tarball, npm stage download, and freshly rebuilt package against the reserved receipt. Approval repeats verification before requesting npm proof of presence. It then checks the public registry's package identity, version, and integrity. An indeterminate registry response requires inspection before any further action.

## Burn a failed candidate

Failed, rejected, and abandoned candidates consume their versions permanently. Keep their original release tags and artifacts.

```sh
pnpm run release burn 3.0.0-beta.1 --stage STAGE_UUID
pnpm run release burn 3.0.0-beta.1 --stage STAGE_UUID --apply
```

Omit `--stage` when upload failed before a UUID was available. The command pushes a signed `burned/vVERSION` tag before rejecting the npm stage. A rejection failure can be retried without replacing that tag. Public versions cannot be burned. Return to `prerelease/3.0.0`, fix the fault, and prepare a new version. Never rerun the upload of a failed candidate or delete a reservation to reuse it.
