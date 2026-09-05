# Pristine upstream checkouts

`upstream/wpt` is a sparse (cone-mode), shallow, `blob:none` partial clone of
[web-platform-tests/wpt](https://github.com/web-platform-tests/wpt), limited to
`resources common dom/nodes css/selectors` and detached at a pinned commit.

## Doctrine

- **No gitlink.** The checkout is never registered as a real git submodule —
  there is no `160000` index entry, and `upstream/` is gitignored.
- **The `ref` field in `.gitmodules` is the pin of record.** `.gitmodules` is
  committed and uses the wheelhouse format: a header comment carrying the label
  and integrity hash (`# wpt-<label> sha256:<hex>`), then a tab-indented block
  with the custom `ref`, `sparse-checkout`, and `verify` keys.
- **`ignore = dirty`** and the trailing `# no-release-tag:` comment record that
  WPT publishes no release tags, so the pin is a commit on `master`.

## Commands

```sh
pnpm run upstream:clone    # materialize/update upstream/wpt at the pinned ref (idempotent)
pnpm run upstream:verify   # check HEAD, sparsity, worktree cleanliness, shallowness, manifest hash
node scripts/git-partial-submodule.mjs verify --deep    # structural checks + the entry's verify command
node scripts/git-partial-submodule.mjs restore-sparse   # re-apply sparse patterns only
```

`verify` exits non-zero unless the checkout exists, `HEAD` equals the pinned
`ref`, the sparse-checkout patterns match the declared set, the working tree is
clean (`git status --porcelain` prints nothing), the repo is shallow
(`.git/shallow` present — checked only when the entry sets `shallow = true`),
and the recomputed manifest sha256 matches the header comment. The
worktree-clean row exists because the manifest hash covers the object database
only; without it, edits to checked-out files would go unnoticed.

`verify --deep` additionally runs the entry's `verify` command
(`pnpm run test:upstream`) after that entry's structural checks pass. The
command string is split on whitespace and executed without a shell, so
quoting, environment assignments, and shell operators (`&&`, `|`, `>`) are
not supported — keep it a plain `<command> <arg>...`.

## Validation of .gitmodules values

Every entry is validated before any of its values reaches a git command line,
because a hostile value such as `ref = --upload-pack=<cmd>` would otherwise be
interpreted as a git option and execute code. The rules are:

- `ref` must be a 40-character lowercase hex commit id;
- `url` must start with `https://`;
- `path` must be relative and resolve strictly inside the repository root
  (absolute paths and `..` traversal are rejected);
- each `sparse-checkout` pattern must not start with `-`.

A violation prints a clear error naming the entry and exits 1. Where the git
subcommand supports it (`checkout`, `sparse-checkout set`), arguments are also
passed after a `--` separator as defense in depth.

## Manifest-hash mode (why not a tarball hash)

The wheelhouse default hashes the GitHub codeload tarball for the pinned ref,
but WPT's tarball is hundreds of MB — too large to re-download in CI just to
check integrity. We instead use wheelhouse's other sanctioned mode, the
**tree-manifest hash**: the sha256 of the exact stdout of

```sh
git -C upstream/wpt -c core.quotePath=false ls-tree -r <ref>
```

This lists every path in the pinned commit with its mode and blob SHA. Blob
SHAs are immutable content addresses, so the manifest pins the full tree
content without touching the network, and it is recomputable offline from the
partial clone (`blob:none` keeps all tree objects locally).

## Bumping the pin (manual procedure)

1. Pick the new commit on WPT `master` and update the `ref` value in
   `.gitmodules`.
2. Run `pnpm run upstream:clone` — the existing checkout is fetched and
   re-checked out at the new ref (nothing is deleted).
3. Recompute the manifest hash and paste it (and a new short-ref label) into
   the header comment:

   ```sh
   git -C upstream/wpt -c core.quotePath=false ls-tree -r <new-ref> | shasum -a 256
   ```

4. Run `pnpm run upstream:verify` (must pass) and `pnpm run test:upstream`
   (the entry's `verify` command), then commit the `.gitmodules` change.
