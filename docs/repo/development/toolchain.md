# Verified contributor toolchain

Run the bootstrap from the checkout root with Node 22.18 or newer. It imports only Node built-ins and tracked `.mts` and JSON files, so it works before `node_modules` exists.

```sh
node scripts/repo/setup/tools.mts
export PATH="$PWD/.cache/bin:$PATH"
pnpm install
```

In PowerShell, prepend the same directory with `$env:PATH = "$PWD\.cache\bin;$env:PATH"`. The prerelease workflows run the bootstrap with `--github-path`, which adds this checkout's tool directory to subsequent steps. CI uses the exact contributor Node version from `.config/external-tools.json`. The [workflow guide](workflows.md) describes the local checkout and artifact actions.

The manifest pins platform-specific GitHub release archives for `nub` and `pnpm` and standalone Socket Firewall Free (`sfw`) binaries, including distinct Linux glibc and musl assets. `npm` has one platform-independent registry archive with its pinned SHA-512 integrity. GitHub asset SHA-256 and SHA-512 pins come from the release API's digests or the shared Wheelhouse manifest. No registry wrapper or global package-manager installation is needed.

The installer rejects missing platform entries, invalid integrity strings, failed downloads, and mismatched bytes. It verifies a download before extraction and rechecks cached archives on every setup. It compares installed executables and sidecars with a fresh extraction of the verified archive, repairing altered installed files. A corrupt archive stops setup. Remove the affected file under `.cache/external-tools/archives/` and rerun setup to download it again.

`nub` provisions the pinned contributor and interoperability Node versions using its Node distribution checksum verification. The harness checks the resolved executable's exact version and runs stock Node. The [package test guide](../testing/commands.md#test-the-testing-library-consumer-path) describes the interoperability cases.

`pnpm install` runs the same bootstrap in `prepare`. `pnpm run setup:tools` repeats it explicitly. Tools and launchers stay under this checkout's ignored `.cache/` directory. Setup does not edit shell configuration or install global shims.

The `npm` and `pnpm` launchers use Wheelhouse's Socket Firewall wrapper behavior. Each manager has its own recursion guard, preserves other launchers on `PATH`, and forwards arguments and exit status. The `pnpm` launcher checks its exact version before every invocation. Interactive commands keep their foreground terminal. Noninteractive wrappers clean up the firewall process group when they exit or receive a signal.

Setup installs `sfw` 1.15.2, the latest public release when this pin was updated. The free binary requires no Socket credentials. Its download and cached bytes pass the same integrity checks as the other tools. Missing or failed setup leaves helpful-error stubs that exit 127. Rerun `node scripts/repo/setup/tools.mts` to repair them. Explicit `SFW_CA_CERT_PATH` and `SFW_CA_KEY_PATH` settings are preserved. Otherwise, an existing readable CA pair under `~/.socket/sfw/` is reused. Setup does not create certificates or change the system trust store.

To update a tool, select its exact upstream release, record each supported asset and its independently obtained digest in `.config/external-tools.json`, and review the manifest diff. For GitHub releases, use the release API's `assets[].digest`. For `npm`, use the exact version's `dist.integrity`. The bootstrap never learns or rewrites the expected digest from the download it is about to execute. Update `.config/node-interop.json` when changing the tested Node matrix.

Validate a new pin with `node scripts/repo/setup/tools.mts`, `pnpm install --frozen-lockfile`, `pnpm run check`, and `pnpm run test:package`. Test the bootstrap in a disposable checkout without `node_modules` or a tool cache when changing installation code.

The [security tooling guide](contributor-tools.md) covers scanner setup, generated schemas, catalog validation,.
