# Set up a cloned repository

Start at the repository root. Read the root `README.md`, agent instructions, `package.json`, and `.config/repo/socket-wheelhouse.json`. These files identify the product, available commands, and required build capabilities.

## Match the repository toolchain

Use the Node and package-manager versions declared by the checkout. Check its version files, `packageManager`, and `engines` before installing dependencies. An engine mismatch is a setup failure, not a reason to change the repository's pins.

Use `pnpm install` from the root with lifecycle scripts enabled. The fleet's prepare sequence restores the shared payload, reconciles workspace packages, and installs the repository's hooks. Do not substitute a recursive install from a package directory. Follow the [tooling rules](../agents.md/tooling.md).

A fresh clone may not contain `scripts/fleet/` or `.config/fleet/` yet. Members obtain those files through the tracked bootstrap under `scripts/repo/bootstrap/`. Use that bootstrap when restoring a missing payload. Do not copy files from a neighboring checkout or edit a generated mirror to repair setup.

## Install only the capabilities the member needs

JavaScript-only members and native members have different prerequisites. Read the repository's declared capabilities and build instructions before installing compilers, SDKs, or platform tools. Cross-compilation also requires the target toolchain. A host compiler alone may not be sufficient.

Repository documentation owns native build flags, supported platforms, fixtures, and manual setup. Fleet documentation owns the common workflow. Keep product credentials separate from dependency installation, and use the documented authentication flow when a private source requires access.

## Check the fresh-clone path

Validate bootstrap changes in a disposable checkout that starts without installed dependencies or a hydrated fleet payload. A warm checkout can hide missing workspace packages and lockfile importers because earlier runs already created them.

Check that installation preserves the expected lockfile and workspace inventory. Use the package manager to generate lockfile changes. Do not hand-edit an importer entry to conceal a failed setup path. Keep this validation separate from the working checkout according to the [isolation guidance](../testing/isolation.md).

## Verify the installation

List the available package scripts with `pnpm run`. Start with the focused command relevant to the intended work. Use the [command guide](commands.md) to distinguish tests, type checks, lint, and repository checks.

If preparation fails, retain the first error and identify whether it came from the toolchain, payload fetch, dependency installation, or a repository build. Fix that cause before repeating the install. Review generated changes without discarding earlier work.

The [settings guide](settings.md) explains which configuration files are owned by the member and which are supplied by Wheelhouse.

Follow the [documentation practices](documentation.md) when adding setup instructions. Keep shared steps in `docs/fleet/` and the member's prerequisites and commands in `docs/repo/`.
