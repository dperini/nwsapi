# Code style

The CLAUDE.md `### Code style` section is the short list of heaviest invariants. This file is the full set of subrules and their rationale. When a rule has a sister skill or hook, the SKILL.md / hook README is canonical for the enforcement details. This file is the reading-order overview.

## Comments

Default to none. Write one only when the WHY is non-obvious to a senior engineer. **When you do write a comment, the audience is a junior dev**: explain the constraint, the hidden invariant, the "why this and not the obvious thing," in full sentences with limited jargon. Don't label it ("for junior devs:", "intuition:", etc.). Write in that voice. No teacher-tone, no condescension, no flattering the reader.

Keep it short. One or two lines. **The delete test: if a reviewer would delete the comment, don't write it.** A comment earns its place when it names an external quirk, a non-obvious invariant, or a real trade-off - the thing that would make a future reader stop and re-read before changing the code. It does not earn its place by restating what the code does or pasting PR/commit context inline. Code tells you what and how; the comment tells you why.

Keep narrative out of source files. Investigation findings, cost figures, incident timelines, and task/plan/removed-code notes (`// Plan:`, `// As requested`, `// removed X`) narrate process, not behavior, and never belong in the file - that context goes in the commit message and PR description, where `git blame` reaches it. Enforced by `.claude/hooks/fleet/no-meta-comments-guard/`. This is a default, not a ban: follow the neighboring convention for public API docstrings, and don't strip existing comments as part of an unrelated change.

## Completion

Never leave `TODO` / `FIXME` / `XXX` / shims / stubs / placeholders. Finish 100%. If too large for one pass, ask before cutting scope.

## `null` vs `undefined`

Use `undefined`. `null` is allowed only for `__proto__: null` or external API requirements.

## Object literals

`{ __proto__: null, ... }` for config / return / internal-state.

## Working directory

Never call `process.chdir()`. It mutates global process state, so concurrent work (parallel installs, spawned subprocesses, other async tasks) silently inherits the new cwd and relative paths resolve wrong. Pass an explicit `cwd` to `spawn` / `exec` / path builders instead of changing the process's directory.

## Imports

No dynamic `await import()`. `node:fs` is the canonical fs source. One import per file: `import { existsSync, promises as fs } from 'node:fs'`. Sync APIs may be cherry-picked (`existsSync`, `copyFileSync`, `readFileSync`, etc.). Async APIs MUST go through the `promises as fs` namespace. Never cherry-pick from `node:fs/promises` (`import { rename } from 'node:fs/promises'` is forbidden; use `fs.rename(...)` instead). Rationale: a single canonical handle for async fs keeps the call sites uniform across the fleet and avoids two imports for what's logically one module. `path` / `os` / `crypto` use default imports. `node:url` is cherry-picked like `node:fs` (`import { fileURLToPath, pathToFileURL } from 'node:url'`) - callers use those symbols directly and `url.fileURLToPath(...)` reads worse than the named form.

Named imports only; no `import * as ns from '…'`. A namespace import pulls a module's whole surface under one binding. That hides the used names from grep and "find references", defeats per-name dead-code analysis and tree-shaking, and composes poorly with the named-export convention. An `import * as lib` reads as "uses everything", so the fleet API-usage audit can't tell which exports are live. Replace it with `import { a, b } from '…'`. The `socket/no-namespace-import` oxlint rule enforces this report-only: rewriting a namespace import to named imports needs the set of members the file reads, which the rule does not infer for you. Exempt: test files (mocking a whole module with `import * as mod` plus `vi.spyOn(mod, …)` is the canonical spy pattern and has no named equivalent), and bare or `node:` builtins (idiomatic, not a fleet-surface concern).

## Type-only imports

A specifier imported only for its type, never a value, uses `import type { X } from '…'` (or the inline `import { type X, y } from '…'` form when the same statement also imports a value). A type-only binding erases at compile time; importing it as a value import keeps a runtime dependency on a module the emitted code never touches. Enforced edit-time by `.claude/hooks/fleet/prefer-type-import-guard/`.

## Object type guards

Reach for `isPlainObject` from `@socketsecurity/lib-stable/objects/predicates` to narrow an `unknown` config value to a plain record, never a hand-rolled `isRecord` / `isRecordValue` / `typeof x === 'object' && x !== null && !Array.isArray(x)`. The lib guard excludes arrays AND built-ins (`Date`, `RegExp`), so a config capability is provably the `{}` shape the code navigates into. A hand-rolled copy drifts: `utils.mts` once carried its own `isRecordValue` that admitted arrays, which is exactly the case the guard exists to reject. Enforced by `socket/prefer-lib-predicates` (report-only - the rule names the lib import; the rewrite is yours).

## Refined Record types

A `Record<string, T>` is a smell when the key is a path or a domain type: it admits any string, so a path-typed map gains a key that is not a path. Reach for a `Map<string, T>` when the key is a path or an opaque id (iteration order, `has()`/`get()` instead of `in`/`[]`), or a branded key union when the domain is closed. The dependency map in `emit-ownership.mts` was `Record<string, string[]>` until the type gate read `null` as not assignable to `string[]` - the plain-`{}` fix silenced the gate without fixing the shape. Enforced by `socket/prefer-refined-record` (report-only - Map for path keys, a branded key for a closed domain; the choice is the caller's).

## HTTP

Never `fetch()`. Use `httpJson` / `httpText` / `httpRequest` from `@socketsecurity/lib/http-request`.

## Subprocesses

Prefer async `spawn` from `@socketsecurity/lib/spawn` over `spawnSync` from `node:child_process`. Async unblocks parallel tests / event-loop work; the sync version freezes the runner for the duration of the child. Use `spawnSync` only when you need synchronous semantics (script bootstrapping, a hot loop where awaiting would invert control flow). When you do need stdin input: `const child = spawn(cmd, args, opts); child.stdin?.end(payload); const r = await child;`. The lib's `spawn` returns a thenable child handle, not a `{ input }` option. Throws `SpawnError` on non-zero exit; catch with `isSpawnError(e)` to read `e.code` / `e.stderr`. Enforced edit-time by `.claude/hooks/fleet/prefer-async-spawn-guard/`.

## File existence

`existsSync` from `node:fs`. Never `fs.access` / `fs.stat`-for-existence / async `fileExists` wrapper.

## File deletion

Prefer `strictDelete` and `strictDeleteSync`, then `safeDelete` and `safeDeleteSync` when needed. Reserve `forceDelete` and `forceDeleteSync` for an explained exception with a narrow lint suppression. Follow the [file deletion rules](file-deletion.md). Use asynchronous cleanup in asynchronous code and synchronous cleanup in synchronous code.

## JSON formatting

Use `stringifyWithFormatting` from `@socketsecurity/lib-stable/json/format` for formatted object reports. Pass `getDefaultFormatting()` for two spaces and LF line endings. Pass explicit formatting when the output needs another indentation or newline style. The formatter adds a trailing newline.

`socket/prefer-socket-lib-json-format` reports native JSON formatting with literal indentation and no custom replacer. Review the value type and newline requirements before replacing the call. The rule does not change code automatically. Compact serialization, custom replacers, and the formatter's implementation stay outside this rule.

## Edits

Edit tool, never `sed` / `awk`.

## Generated reports

Write checkout reviews and scan reports to `.claude/reports/`, which is ignored by Git. Record plans in `.claude/plans/`. These files describe work in progress or the state of one checkout.

Track selected benchmark inputs and generated result data in `assets/repo/bench/`. Keep the generation scripts and enough evidence to reproduce the published comparison. Store large raw profiles in temporary or ignored storage. Explain measurements and decisions in `docs/repo/perf/journal.md`.

## Fixture names

Fixture and example names in test source are fake but DESCRIPTIVE: `example.js`, `helpers/example.js`, `/path/to/example`, `@example/module`. Never a single-letter placeholder (`x.js`, `./a.js`, `/path/to/x`): it carries no meaning at the call site, collides silently when a second fixture joins it, and greps for nothing. The `@example` npm scope is the sanctioned fake module scope - it is empty on npm (0 packages, `@example/module` 404s; verified 2026-08-08), so a fake module name under it can never collide with a real dependency. A string whose segments are ALL single letters (`a/b/c`) is path-shape algebra, not a named fixture, and stays legal. Enforced by `scripts/fleet/check/fixture-names-are-descriptive.mts`, which gates every tracked test file and fails on one finding; keep an intentional single-letter name with `fixture-name: allow` on the line, which is the escape for a test whose subject IS single-character names.

### People in fixtures are fictional

A fixture names a FICTIONAL person: `octocat` (GitHub's own published
placeholder, and the fleet's habit), with `example-user`, `example-org` and
`example-bot` beside it for extra actors. Never a real maintainer's login or
name.

Three reasons, and the third is the one that bites. A fixture asserting on a
real login reads as a live account's behaviour rather than a stand-in. It greps
against real people, so a search for a teammate turns up test data. And it
commits a personal identifier to a public surface, which is the same objection
[`public-surface-hygiene`](public-surface-hygiene.md) makes to a real customer
or private repo name.

`test-identities-are-fictional.mts` enforces it, and derives what counts as
REAL at run time from the checkout's own git identity. Nothing real is written
down: a committed deny list of maintainer logins would be the leak the rule
exists to stop, and it would go stale the moment the team changed. The gate
reports a file and line, never the identity itself, for the same reason.

A test whose SUBJECT is a real identity - the git-identity plumbing has to name
one somewhere - keeps it with `real-identity: allow` on the line, or
`real-identity: allow-file` for the file. The corpus is clean, so every tracked
test file gates and one finding fails the run.

## Inclusive language

See [`inclusive-language.md`](inclusive-language.md) for the substitution table.

## Sorting

Sort alphanumerically (literal byte order, ASCII before letters). Applies to: object property keys (config + return shapes + internal state, `__proto__: null` first); named imports inside a single statement (`import { a, b, c }`); `Set` / `SafeSet` constructor arguments; allowlists / denylists / config arrays / interface members; **string-equality disjunctions** (`x === 'a' || x === 'b'` and the De Morgan dual `x !== 'a' && x !== 'b'`). Position-bearing arrays (where index matters) keep their meaningful order. Full details in [`sorting.md`](sorting.md). When in doubt, sort.

## Env-var checks

`'CI' in process.env` presence check over truthy. Whether `CI` is set is what matters; the value is irrelevant.

## `node:os` import

`import os from 'node:os'` (default import). Not `import { tmpdir, homedir } from 'node:os'`. Default-import shape lets call sites read `os.tmpdir()` etc. Clearer at the call site that this is an OS-level lookup.

## Logger

`getDefaultLogger()` from `@socketsecurity/lib-stable/logger` over `console.*` / `process.stderr.write` / `process.stdout.write` (enforced by `.claude/hooks/fleet/logger-guard/`). The logger wraps level routing and transcript-safe rendering.

## Doc filenames

Follow the [documentation practices](../development/documentation.md). Put shared guidance in `docs/fleet/` and repository details in `docs/repo/`. Use `perf/` and `testing/` for those topics.

Use lowercase words separated by hyphens for topic documents under `docs/` and `.claude/`. Keep maintained `README.md` files at the repository root. Preserve required root filenames such as `CHANGELOG.md`, agent instruction filenames, and upstream-owned filenames.

Use `practices.md` for instructions, `design.md` for implementation design, and `journal.md` for experiments and decisions. Create only the documents needed for the subject. Do not repeat the parent directory's topic in a filename. For example, use `docs/repo/testing/coverage.md` and `docs/repo/perf/caching.md`.

The filename guard is `.claude/hooks/fleet/markdown-filenames-are-canonical-at-edit/`. Its shared `REDUNDANT_DIR_TOKENS` table in `_shared/markdown-path.mts` supplies the existing directory checks. The documentation contract also requires a review of ownership, purpose, and prose.

Use matching topic names for documents and scripts that share a responsibility. Compare both existing names and choose the clearer one. Follow the [check naming rules](check-names.md) for check scripts.

## Inline `<script>` defer/async

`<script defer>` and `<script async>` without a `src=` attribute are a spec no-op. The HTML parser ignores the deferral on inline scripts. Wrap the body in a `DOMContentLoaded` listener instead. Enforced by `.claude/hooks/fleet/inline-script-defer-guard/` + the `socket/no-inline-defer-async` oxlint rule. Bypass: `Allow inline-defer bypass`.

## ESLint / Biome config refs

Stale. The fleet runs oxlint / oxfmt. Don't reference `.eslintrc` / `eslint-config-*` / `biome.json` / `@biomejs/*` in any new code (enforced by the `socket/no-eslint-biome-config-ref` oxlint rule).

## `structuredClone` vs JSON round-trip

`structuredClone(x)` is banned for JSON-shaped data. `JSON.parse(JSON.stringify(x))` (or `JSONParse(JSONStringify(x))` from `@socketsecurity/lib/primordials/json`) is 3-5× faster because it skips the full HTML structured-clone algorithm (type tagging, transferable handling, prototype preservation, cycle detection; none of which the JSON subset needs). The common case is "defensive-copy a `JSON.parse`d value to defend against caller mutation". That's purely JSON-shaped by construction. Opt back in per-line with `// oxlint-disable-next-line socket/no-structured-clone-prefer-json -- <reason>` when the value contains `Date` / `Map` / `Set` / `RegExp` / `ArrayBuffer` / typed-array shapes. Enforced edit-time by `.claude/hooks/fleet/prefer-json-clone-guard/` + the `socket/no-structured-clone-prefer-json` oxlint rule. Bypass: `Allow no-structured-clone-prefer-json bypass`.

## Ellipsis character, not three dots

In user-facing text (string / template / comment), a trailing ellipsis is the single character `…` (U+2026), not three literal dots `...`. It reads as one glyph and matches fleet typography. Only WORD-FINAL ellipses are flagged (`Loading...` → `Loading…`); the spread/rest operator (`...args`), path globs (`/Users/<user>/...`), and CLI placeholder notation (`[path...]`, `args...`) are left untouched. Enforced + auto-fixed by the `socket/prefer-ellipsis-char` oxlint rule. Bypass for an intentional three-dot form: `// oxlint-disable-next-line socket/prefer-ellipsis-char`.

## Binary resolution: `node_modules/.bin`, not global `which`

Don't shell out to `which` / `command -v` / `where` to locate a project binary - those search the GLOBAL PATH. Fleet binaries are linked into `node_modules/.bin` by `pnpm install`; a global lookup returns nothing on a normal checkout (so the caller silently degrades) or, worse, finds a different-version binary and runs against the wrong engine. Resolve the installed package instead: `require.resolve('<pkg>/package.json')` → read its `bin` field → `resolveBinaryPath()` from `@socketsecurity/lib-stable/dlx/binary-resolution` for the platform `.cmd`/`.ps1` wrapper. (`@socketsecurity/lib-stable/exe/path/which`'s `whichSync` is the right tool when you genuinely need a PATH search, e.g. the user's system `git`.) Enforced by the `socket/no-which-for-local-bin` oxlint rule. Bypass for a genuine global lookup: `// oxlint-disable-next-line socket/no-which-for-local-bin`.

## Comments: cross-port Lock-step

See [`parser-comments.md`](parser-comments.md) §5–7 for the full Lock-step comment spec (port provenance, byte-identical header block, deviation paragraphs). Enforced edit-time by `.claude/hooks/fleet/lock-step-ref-nudge/` and CI-gate-time by `scripts/fleet/check/lock-step-refs-resolve.mts` + `scripts/fleet/check/lock-step-headers-match.mts`. Bypass: `Allow lock-step bypass`.

## Pointer comments

`// see X` comments need both a destination and an inline one-line claim of what's at the destination (enforced by `.claude/hooks/fleet/pointer-comment-nudge/`). "see X" alone forces the reader to chase the link to learn anything; "see X: it does Y" gives the reader Y up front and X for verification.

## `Promise.race` / `Promise.any` in loops

Never re-race a pool that survives across iterations (the handlers stack). See `.claude/skills/fleet/plugging-promise-race/SKILL.md`.

## Prefer `Promise.allSettled` for order-independent batches

When you `await Promise.all([...])` and DISCARD the resolved array, the await is its own statement. The only thing `Promise.all` does that `Promise.allSettled` doesn't is abort the whole batch on the first rejection, leaving the sibling promises' rejections unhandled. For order-independent concurrent work prefer `Promise.allSettled(...)` so one failure doesn't abandon the rest (then `.filter(Boolean)` / inspect the settled results). Keep `Promise.all` when you consume the positional result (`const [a, b] = await Promise.all(...)`) or genuinely want fail-fast - for the latter, mark it: `// oxlint-disable-next-line socket/prefer-all-settled -- fail-fast: <reason>`. Enforced by `socket/prefer-all-settled` (report-only; the fix changes error semantics, so it's the author's call).

## Prefer the keyed combinators for named values

The positional forms fit a list of the SAME kind of thing. When you are
combining a fixed set of NAMED things, positional destructuring bites: put the
names in a different order than the calls and the values swap, with no error
anywhere.

<details>
<summary><b>Detail</b> - the full table (5 rows)</summary>

```ts
// Runs fine. config now holds the lockfile and lockfile holds the config.
const [config, lockfile] = await Promise.all([readLockfile(), readConfig()])
```

Keys can't swap. Use the keyed helpers from socket-lib
(`@socketsecurity/lib/promises/all-keyed`, the tc39 proposal-await-dictionary
shapes; no engine ships them natively yet):

```ts
import { pAllKeyed } from '@socketsecurity/lib/promises/all-keyed'

// All three reads start together (no waterfall), and each value lands
// under its own name no matter how the lines are ordered.
const { config, manifest, lockfile } = await pAllKeyed({
  config: readConfig(),
  manifest: readManifest(),
  lockfile: readLockfile(),
})
```

Decision table:

| Shape of the work                                                | Use                                          |
| ---------------------------------------------------------------- | -------------------------------------------- |
| A fixed set of named values, fail-fast                           | `pAllKeyed({...})`                           |
| A fixed set of named values, per-key failure handling            | `pAllSettledKeyed({...})`                    |
| A list of the same kind, result consumed positionally, fail-fast | `Promise.all([...])`                         |
| A list of the same kind, order-independent, failures inspected   | `Promise.allSettled([...])` (the rule above) |
| List with a concurrency cap / retries                            | `pEach` / `pFilter` (`promises/iterate`)     |

Same rejection semantics as their positional cousins: `pAllKeyed` fail-fast
with every value subscribed (no unhandled-rejection stragglers), and
`pAllSettledKeyed` always resolves with `{ status, value | reason }` records.
The result is a null-prototype object; own enumerable keys, symbols included.

</details>

## `Safe` suffix

Non-throwing wrappers end in `Safe`, such as `applySafe` and `weakRefSafe`. The wrapper catches the thrown value and returns `undefined` or its documented fallback. Use this suffix instead of `Try`, `OrUndefined`, or `Maybe`. The `safeDelete` and `safeDeleteSync` names have a prefix and can throw.

## `node:smol-*` modules

Feature-detect, then require. From outside socket-btm (socket-lib, socket-cli, anywhere else): `import { isBuiltin } from 'node:module'; if (isBuiltin('node:smol-X')) { const mod = require('node:smol-X') }`. The `node:smol-*` namespace is provided by socket-btm's smol Node binary; on stock Node `isBuiltin` returns false and the require would throw. Wrap the loader in a `/*@__NO_SIDE_EFFECTS__*/` lazy-load that caches the result. See `socket-lib/src/smol/util.mts` and `socket-lib/src/smol/primordial.mts` for canonical shape. <!-- docs-refs-ignore: paths in the socket-lib repo --> **Inside** socket-btm's `additions/source-patched/` JS, the smol binary's own bootstrap code, use `internalBinding('smol_X')` directly. That's the C++-binding access path and it's guaranteed available there.

## Agent-readability: name for grep

A coding agent (and a hurried human) navigates by grep/ripgrep, not a dependency graph or language server, and pays roughly 10 tokens per line it reads. So how code is _named_ and _typed_ is what makes it findable or noise. Three rules:

- **An exported name carries a domain word.** A single generic token (`create`, `parse`, `get`, `handle`, `diff`) is a grep-noise magnet. In one audit `create` matched 1585 times across 459 files, versus 43 across 19 for `createStripeClient`. One-word names are about 61% unique, two-word about 88%, three-word about 96%, so every export should carry a domain word. Enforced by `socket/exported-name-has-domain-word` plus the edit-time `generic-export-name-nudge`; the shared denylist and the sanctioned-convention exemptions (`check`, `main`, `run`, …) live in `.config/fleet/oxlint-plugin/lib/generic-name-tokens.mts`.
- **The definition line is the one line the agent is guaranteed to read.** Put the orienting one-liner at the `@file` header or directly above the export - the fleet already does this. If code deliberately does not do something a reader expects, say so at the definition where they will search, not in a distant note.
- **Types are documentation.** A typed signature answers "what flows through here?" without reading the body, and every `any` forces an implementation read (already `error` fleet-wide). Branded ID types (`UserId` instead of a bare `string`) let the compiler name the mistake, so the fix is one turn instead of a debugging session.
