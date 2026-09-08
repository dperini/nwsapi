# Publishing

Choose the release procedure from the member's declared distribution channels and committed workflows. The primary `build` and optional `secondaries` describe different channels. A repository can publish through more than one channel, and completion of one does not establish completion of the others.

## Prepare the exact release

Use the version named by the user. Confirm the source revision, package identities, target platforms, and intended destination. Inspect existing published state before attempting a release. Follow the [version rules](../agents.md/version-bumps.md) and [state verification rules](../agents.md/verify-state-before-acting.md).

Build and test the artifact that will ship. Verify exports, installation behavior, included files, and relevant platform requirements. Keep package-specific signing, compatibility, and manual checks in `docs/repo/`. A source test alone cannot establish that a packed or installed artifact works.

## Follow the distribution channel

| Channel | Required distinction |
| --- | --- |
| npm packages and native addons | Use the staged release and publish pipeline. Verify package contents and platform packages. CI uses the configured trusted-publisher flow. |
| GitHub release binaries | Verify each target artifact, checksums, and required signing or notarization before the immutable release is finalized. |
| Rust crates or Go modules | Follow the member's registry or tag workflow. Check package identity, workspace relationships, and the exact source revision. |
| GitHub Actions | Verify the committed distribution files and the action at the intended release tag. |
| Browser or editor extensions | Follow the product's store or release workflow, including permissions, update compatibility, and required manual checks. |
| Members without a publish channel | Run the relevant checks without inventing a publication step. |

These rows describe branches of the process. They do not imply that one npm command handles every channel. The [settings guide](../development/settings.md) explains where the member declares its build and release behavior.

## Use the release wrappers

For members using the staged npm workflow, inspect `scripts/fleet/release-pipeline.mts` and `scripts/fleet/publish-pipeline.mts` through their help and status commands. Use the member's package-script alias where one exists. The release wrapper handles readiness and the named version. The publish wrapper handles staging, verification, and explicit promotion.

Do not invoke a raw registry publish command to bypass the workflow. Keep staged, approved, and publicly available states distinct. Verify the final registry state before reporting that publication succeeded. Follow the [trusted-publishing policy](../agents.md/trusted-publishing-posture.md) and [artifact rules](../agents.md/artifact-hygiene.md).

For non-npm channels, follow the member's documented workflow and inspect its current trigger. Do not copy npm's promotion sequence onto a binary or extension release. The [GitHub Action contract](../agents.md/github-action-release-contract.md) and [immutable-release rules](../agents.md/immutable-releases.md) cover their respective requirements.

Release versions, tags, uploaded artifacts, and published packages must agree. Report any incomplete channel explicitly. Do not replace a published immutable artifact to hide a failed release.
