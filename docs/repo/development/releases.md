# Publish a v3 release

`pnpm run publish:status` shows the release request and npm stages. `pnpm run release --help` describes all commands. Use the version intended for publication. Versions must use the `3.x.y-prerelease` form; examples below use `3.0.0-prerelease.1` as a placeholder. The request in `.config/release-request.json` stays disabled until preparation records a version.

Use `publish:prepare`, `publish:status`, `publish:verify`, and `approve` in that order. A release identifies the reserved version and its artifacts. Publishing distributes those artifacts. `release:burn` permanently abandons that version across GitHub and npm.

Run `pnpm run approve`, including `run`. Bare `pnpm approve` is pnpm's dependency-permissions command. Publication approval verifies the candidate before requesting npm proof of presence. No browser automation is required for the normal CLI path.

Mutating commands require `--apply`. Staging requires CI with OIDC. Direct repository packing and publishing are blocked by lifecycle guards. Use `pnpm run package` to inspect a tarball locally. The existing `npm:*` and `release:*` aliases remain available.

## Configure publishing

Run these commands from a maintainer terminal with GitHub repository administration access and npm package ownership:

```sh
pnpm run publish:login
pnpm run publish:trust
pnpm run publish:trust --apply
```

The trust command uses the shared `publish-npm` GitHub environment and adds a policy for `prerelease/3.0.0` while preserving its existing exact branch policies and review rules. It establishes a stage-only npm publisher for `dperini/nwsapi` and `publish-npm.yml`. It verifies the replacement before revoking stale bindings for that workflow. Publishers for other workflows remain untouched. Unexpected broad environment policies require correction before reconciliation can continue. npm may request browser authentication or a one-time password.

## Reserve and stage

Start from a clean, pushed `prerelease/3.0.0` checkout whose latest CI and coverage runs passed. Configure Git signing first.

```sh
pnpm run publish:prepare 3.0.0-prerelease.1
pnpm run publish:prepare 3.0.0-prerelease.1 --apply
```

Preparation creates a signed commit and signed `v3.0.0-prerelease.1` tag, then atomically pushes both. Existing local tags, remote reservations, and published versions cannot be reused. The request-file push starts the inline publishing workflow. CI verifies source, security, coverage, package interoperability, and the fuzz corpus. It uploads a GitHub prerelease containing the exact tarball and its SHA-512 receipt before calling `npm stage publish` through OIDC. The package version carries the `-prerelease` suffix and npm stages it under the `next` dist-tag; `latest` is never moved. The stage UUID appears in the workflow summary.

The workflow uses `next` and never moves `latest`. A disabled request skips the publishing job entirely. The workflow also supports manual dispatch once GitHub exposes it. No CI job approves a stage.

## Verify and approve

Use the exact signed release checkout, with no local changes:

```sh
git fetch origin --tags
git checkout --detach v3.0.0-prerelease.1
pnpm install --frozen-lockfile
pnpm run publish:verify 3.0.0-prerelease.1 --stage STAGE_UUID
pnpm run approve
pnpm run approve --apply
```

Approval can discover a single staged candidate for the requested version and the `next` tag. It refuses missing, malformed, or ambiguous candidates. Pass `VERSION --stage UUID` to name a candidate explicitly.

Verification compares the actual GitHub tarball, npm stage download, and freshly rebuilt package against the reserved receipt. Approval repeats verification before requesting npm proof of presence. It then checks the public registry's package identity, version, and integrity. An indeterminate registry response requires inspection before any further action.

## Recover after an interruption

Start with observations. A lost connection or missing stage in one response does not establish whether an upload or approval succeeded. Do not repeat an upload, approve another candidate, reject a stage, or burn a version while its state is uncertain.

Replace `VERSION` and `RUN_ID` with the reserved version and its workflow run:

```sh
pnpm run publish:status
gh run list --repo dperini/nwsapi --workflow publish-npm.yml --branch prerelease/3.0.0
gh run view RUN_ID --repo dperini/nwsapi --log
gh release view vVERSION --repo dperini/nwsapi
npm view nwsapi@VERSION version dist.integrity --json
npm dist-tag ls nwsapi --json
```

These commands inspect remote state without changing publication. An authentication error, timeout, or unavailable registry is an unknown result, not evidence that a version is absent. Check the exact version, source commit, stage UUID, receipt integrity, and intended `next` tag together.

| Observed state                                                                           | Next action                                                                                                                                                                                            |
| ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Upload workflow still running                                                            | Wait for that run. Do not start another upload.                                                                                                                                                        |
| Upload failed and the version is confirmed unpublished                                   | Keep the reservation and artifacts. Inspect any remaining stage, then use the explicit burn procedure below before preparing a new version.                                                            |
| One matching stage exists and the version is unpublished                                 | From the signed release checkout, run `pnpm run publish:verify VERSION --stage STAGE_UUID`. Review the result before approval. Verification downloads artifacts and builds locally without publishing. |
| Approval was interrupted and the exact version is public with matching receipt integrity | Publication succeeded. Check the intended tag. Do not approve or burn it again.                                                                                                                        |
| Approval was interrupted and the version remains unpublished with one verified stage     | Recheck status and verification. A maintainer can then explicitly retry approval for that UUID.                                                                                                        |
| Multiple stages, mismatched integrity, a missing receipt, or unavailable services        | Stop mutations and resolve the discrepancy from the workflow log, GitHub artifacts, and npm state. A public version cannot be burned.                                                                  |

A wrong dist-tag requires a separate maintainer decision. Do not republish the version to repair it. Keep evidence of the interrupted operation until its outcome is known.

## Burn a failed candidate

Failed, rejected, and abandoned candidates consume their versions permanently. Keep their original release tags and artifacts.

```sh
pnpm run release burn 3.0.0-prerelease.1 --stage STAGE_UUID
pnpm run release burn 3.0.0-prerelease.1 --stage STAGE_UUID --apply
```

Omit `--stage` when upload failed before a UUID was available. The command pushes a signed `burned/vVERSION` tag before rejecting the npm stage. A rejection failure can be retried without replacing that tag. Public versions cannot be burned. Return to `prerelease/3.0.0`, fix the fault, and prepare a new version. Never rerun the upload of a failed candidate or delete a reservation to reuse it.

Burn markers are checked during preparation and immediately before GitHub creation, npm upload, and npm approval. GitHub and npm have no shared transaction, so maintainers must serialize burning and publication of the same version.
