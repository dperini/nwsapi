# Development commands

Run commands from the repository root. Read its `package.json` before assuming an optional script exists. Fleet members share many command names, but a member may wrap them to include product-specific work.

| Command | Purpose |
| --- | --- |
| `pnpm run build` | This builds the current product using the member's build system. |
| `pnpm test` | This runs the member's default test scope. Check its lane mapping before interpreting the result. |
| `pnpm run cover` | This collects and merges coverage through the fleet runner. |
| `pnpm run type` | This checks the configured TypeScript source and declarations. |
| `pnpm run lint` | This checks the configured source rules. |
| `pnpm run format:check` | This checks formatting without requesting a rewrite. |
| `pnpm run fix` | This applies configured formatting and automated fixes. Review its changes. |
| `pnpm run check` | This runs repository and fleet policy checks in the selected scope. |
| `pnpm run update` | This updates dependencies and related fleet-managed inputs. Read the [upgrade guide](upgrades.md) first. |

Use the runner's `--help` or `--describe` support to inspect available options. Do not invent flags or bypass the wrapper that supplies isolation, budgets, and reporting.

## Match verification to the change

Run affected tests and checks while iterating. Changes to shared setup, build configuration, declarations, or runners may require a broader scope. Follow the [test performance guidance](../testing/performance.md) when selecting affected work.

A successful type check does not replace a test, and a successful test does not establish that the package builds or publishes correctly. Use current built outputs for artifact tests. The [quality guidance](../testing/quality.md) explains how to avoid testing an installed stable version by mistake.

Use `pnpm run get-green` when the task requires the repository's full readiness workflow. Inspect its supported options and scope first. Do not start a repository-wide repair pass for a small change unless that broader work is part of the task.

Keep commands for native tests, browser tests, upstream conformance, and manual product checks in `docs/repo/`. The [workflow guide](../workflows/practices.md) explains how local results relate to CI.

For a fresh checkout, start with [setup](setup.md). Use the [settings guide](settings.md) when changing runner or workflow behavior.
