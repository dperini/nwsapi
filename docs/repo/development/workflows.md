# Local workflow actions

The `prerelease/3.0.0` workflows use inline Git checkout and local actions under `.github/actions/repo/`. `pnpm run check` rejects remote action references in workflows and composite actions. Changes to workflow infrastructure run the full Node, browser, and fuzz lanes.

Both checkout steps fetch the event's exact commit with full ancestry. Authentication is scoped to the bootstrap process and is never saved in `.git/config`. Pull requests test the event's merge commit. The verified contributor-tool bootstrap still runs before dependency installation.

The local artifact action follows Wheelhouse's runtime bridge and artifact-service protocol. GitHub injects artifact credentials only into JavaScript actions, so a small local action masks the runtime token and exports it through `GITHUB_ENV`. The upload script then runs under the pinned contributor Node version. It streams ZIP creation and upload, includes hidden corpus files, enforces 14-day retention capped by repository policy, and preserves the warning when no corpus files exist. Symlinks and invalid archive names are rejected. Service failures fail the upload step.

The port was reviewed against Wheelhouse commit `3d88f8995613b8fbc7cf3e9639464befb2414daa`, specifically `ci-gates.yml`, the `expose-actions-runtime` and `upload-artifact` local actions, and `scripts/fleet/artifact/`. The ZIP writer is adapted from that implementation. Wheelhouse records its artifact protocol source as `actions/toolkit` commit `ffdc20ef9208b774c9a99db718b9b02c64d84e70`. This repository implements the upload surface its fuzz workflow needs and uses Node built-ins instead of adding runtime package dependencies.

Behavioral tests cover the parsed workflows, checkout history and credential persistence, runtime exports, ZIP interoperability, and the create/upload/finalize protocol. Tests mirror their owning scripts under `test/repo/`. A workflow change must also pass both hosted prerelease workflows, including a real artifact upload.
