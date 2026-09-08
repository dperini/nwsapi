# Test isolation

A test should change only resources that its fixture owns. A fixture is the temporary data and environment prepared for a test. Remove those resources when the test finishes, including when it fails.

## Use `os.tmpdir()` for temporary fixtures

Create fixtures under `os.tmpdir()` instead of the checkout or a hard-coded `/tmp` path. The operating system chooses the appropriate temporary directory. Use `mkdtemp()` to give each fixture a unique name.

```ts
import { promises as fs } from 'node:fs'
import { strictDelete } from '@socketsecurity/lib/fs/strict'
import os from 'node:os'
import path from 'node:path'

const fixtureRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'test-fixture-'))
try {
  // Create the fixture and run its assertions here.
} finally {
  await strictDelete(fixtureRoot, { base: os.tmpdir() })
}
```

This example targets `@socketsecurity/lib` 7.0.2. The `base` option requires the target to be strictly inside the temporary directory. It prevents cleanup from deleting that base directory itself. A repository can use its `@socketsecurity/lib-stable` alias when that alias provides the same API.

For synchronous cleanup, import `strictDeleteSync` and call `strictDeleteSync(fixtureRoot, { base: os.tmpdir() })`. Prefer awaited asynchronous cleanup in asynchronous tests.

Follow the [file deletion rules](../agents.md/file-deletion.md): prefer strict deletion, then safe deletion when the strict helper does not fit. In `@socketsecurity/lib` 7.0.2, a safe fallback can name its allowed roots with `safeDelete(fixtureRoot, { allowedDirs: [os.tmpdir()] })`. This option adds to the built-in roots. Force deletion requires an explained lint suppression and must not be an automatic retry after a refusal.

Use the repository's existing fixture helper when it provides the same ownership and cleanup. Register per-test cleanup as soon as setup allocates the directory. For suite-wide read-only seeds, register cleanup after the suite instead.

Create a separate directory for each mutating test and shard. Close streams, stop servers, and wait for child processes before removing their files. Delete only the directory that the fixture created. Keep tracked test inputs separate and copy them into the temporary directory before changing them.

A temporary path can contain spaces or resolve through a platform-specific alias. Pass paths as process arguments and normalize them only where the relevant comparison requires it. Do not make a test depend on the spelling of the machine's temporary root.

## Keep test writes out of the checkout

Treat the working checkout and tracked fixtures as read-only test inputs. Put generated files, temporary manifests, Git repositories, caches, logs, and extracted archives inside the fixture directory. Run commands with that directory as their working directory, and set explicit output paths when a tool ignores it.

A test that needs to change source files or configuration must use a temporary copy containing the required inputs. Do not edit the working checkout and then restore it. A failed test or interrupted process can leave those changes behind, and restoration can overwrite another person's work.

Do not use `git clean`, `git reset`, or broad deletion to tidy up after tests. Cleanup must target the fixture's own resources. Adding a temporary path to `.gitignore` does not make writing test state into the repository acceptable.

When diagnosing pollution, compare checkout changes before and after the run. Investigate new changes without deleting pre-existing work. Retain failure artifacts only in an explicit runner-owned location, and report that location. Published coverage or benchmark reports use their documented output paths and remain separate from disposable fixture state.

## Isolate dependency installation too

A test that runs a package manager needs its own package or workspace directory. Do not run installation in the real checkout with a temporary `PNPM_HOME` or store setting. That can relink the checkout's dependencies into a directory that cleanup later removes.

Keep the working directory, workspace configuration, dependency links, and store ownership consistent. Do not share a writable `node_modules` tree between the fixture and the checkout. Tests of install or bootstrap behavior must account for lifecycle scripts that can write beyond the immediate package directory.

Before publishing a build made during installation tests, check that generated output contains no temporary fixture paths or machine-specific store paths. Keep those checks in the repository's artifact validation.

## Choose parallel execution by resource ownership

Parallel execution is safe when tests cannot change resources used by one another. Process isolation separates memory, but it does not give each process private files, ports, databases, or remote repositories.

| Test behavior | Execution choice |
| --- | --- |
| The test uses pure functions and local values. | It can run in parallel with independent tests. |
| The test reads an immutable seed or fixture. | It can share that fixture while all readers are active. |
| The test changes files or Git refs. | It can run in parallel when its directory and origin are private. |
| The test uses a local server. | It needs its own server state and an assigned available port. |
| The test changes environment variables, working directory, globals, timers, or module mocks. | Serialize it within the affected process or use a suitably isolated worker. |
| The test exercises process exit, signals, native state, or CLI startup. | Use a separate process and retain its process-level assertions. |

Do not run tests that change the same process state concurrently. Restore state between sequential tests. Use a separate process when cleanup cannot reliably restore the original state or when process behavior is the subject of the test.

Disabling file isolation and enabling concurrent test cases are separate decisions. A suite that cleans up between files may still be unsafe when cases overlap. Review both settings, including any setup shared by workers.

## Give subprocesses a temporary environment

Create a unique directory under the operating system's temporary directory. Give the child process a working directory, home directory, and cache locations inside that fixture. Set these values in the child's environment rather than changing the shell that runs the test suite.

Check which environment variables each invoked tool reads. Tools may read both uppercase and lowercase forms of configuration variables. A home-directory override alone may leave a cache, credential store, or explicit configuration path pointing outside the fixture.

Remove inherited configuration values first. Set the fixture's isolation paths next, then apply the values required by the test. A later cleanup helper must not remove the isolation paths. Use `ISOLATED_ENV_VARS` from `scripts/fleet/prose/test-isolation-law.mts` when implementing or reviewing the helper.

Preserve access to the intended toolchain. Changing a tool's home directory can also change where it finds installed binaries. Run availability probes with the same isolation as the commands that follow them.

## Restore shared state

When a test changes environment variables in the current process, save their earlier values and restore them in cleanup. Delete variables that were originally absent. Tests that change the same process state must not run concurrently in that process.

Also restore mocks, module state, and open servers. Stop child processes before deleting the files they use. Register cleanup when the fixture is created so an assertion failure cannot skip it.

## Treat credentials and network access separately

A temporary home directory does not prevent access to an operating-system keychain or an inherited token. Use test credentials and a controlled credential provider when authentication is part of the test. Block unexpected external requests according to the [network rules](../agents.md/no-live-network-in-tests.md).

The [test ownership rules](../agents.md/test-layout.md) describe the fleet's subprocess requirements. Each repository documents its helpers and the environment variables they control in `docs/repo/testing/`.
